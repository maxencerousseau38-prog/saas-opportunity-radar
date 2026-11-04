// AI gateway (Implementation Blueprint §5.3; ADR-006): profile resolution,
// budget refusal before the call, timeout, Zod validation, at most one repair,
// cited-identifier validation and usage recording. Agents have no tools.
import type { z } from "zod";
import {
  ProviderError,
  type AIProvider,
  type ModelProfile,
  type StructuredAIRequest,
  type StructuredAIResult,
} from "./provider";

export type UsageOutcome =
  "ok" | "schema_invalid" | "timeout" | "provider_error" | "budget_refused";

export interface UsageRecord {
  provider: string;
  model: string;
  operation: "structured_output" | "embedding" | "repair";
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  reportedCostUsd: number | null;
  latencyMs: number | null;
  outcome: UsageOutcome;
}

export interface GatewayCallContext {
  /** Remaining AI budget of the job, in USD. */
  remainingBudgetUsd: number;
  /** Every identifier the output may cite (snapshot, evidence, product IDs…). */
  allowedIds: ReadonlySet<string>;
  recordUsage: (record: UsageRecord) => Promise<void>;
  signal?: AbortSignal;
}

export type GatewayErrorCode =
  "BUDGET_EXHAUSTED" | "SCHEMA_INVALID" | "UNKNOWN_CITED_ID" | "TIMEOUT" | "PROVIDER_ERROR";

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;
  readonly errorClass: "transient" | "permanent" | "budget";
  constructor(code: GatewayErrorCode, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.errorClass =
      code === "BUDGET_EXHAUSTED"
        ? "budget"
        : code === "TIMEOUT" || code === "PROVIDER_ERROR"
          ? "transient"
          : "permanent";
    this.retryable = this.errorClass === "transient";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Values at keys named `*_id` / `*_ids`, and any UUID-shaped string, anywhere in the output. */
export function citedIds(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return key.endsWith("_id") || key.endsWith("_ids") || UUID.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((v) => citedIds(v, key));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => citedIds(v, k));
  }
  return [];
}

export interface GatewayOptions {
  provider: AIProvider;
  /** Server-side profile → model mapping (PD-24 fixes the real one). */
  models: Partial<Record<ModelProfile, string>>;
}

export class AIGateway {
  constructor(private readonly options: GatewayOptions) {}

  get providerId(): string {
    return this.options.provider.id;
  }

  modelFor(profile: ModelProfile): string {
    const model = this.options.models[profile];
    if (!model)
      throw new GatewayError("PROVIDER_ERROR", `no model configured for profile ${profile}`);
    return model;
  }

  async generate<S extends z.ZodType>(
    request: StructuredAIRequest<S>,
    context: GatewayCallContext,
  ): Promise<StructuredAIResult<z.infer<S>>> {
    const provider = this.options.provider;
    const model = this.modelFor(request.modelProfile);
    const base = { provider: provider.id, model };
    const record = (
      operation: UsageRecord["operation"],
      outcome: UsageOutcome,
      usage?: Partial<UsageRecord>,
    ) =>
      context.recordUsage({
        ...base,
        operation,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        reportedCostUsd: null,
        latencyMs: null,
        outcome,
        ...usage,
      });
    let spent = 0;

    const call = async (
      operation: "structured_output" | "repair",
      repair?: { previousOutput: unknown; problems: string[] },
    ) => {
      const callRequest = {
        request: request as StructuredAIRequest<unknown>,
        model,
        ...(repair ? { repair } : {}),
      };
      const worstCase = provider.estimateMaxCostUsd(callRequest);
      const allowed = Math.min(request.maxCostUsd, context.remainingBudgetUsd) - spent;
      if (worstCase > allowed + 1e-12) {
        await record(operation, "budget_refused", { estimatedCostUsd: worstCase });
        throw new GatewayError(
          "BUDGET_EXHAUSTED",
          "the worst-case cost exceeds the remaining AI budget",
        );
      }
      const timeout = AbortSignal.timeout(request.timeoutMs);
      const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
      const started = Date.now();
      try {
        // Race the call against the abort signal: a provider that ignores it cannot hang a job.
        const aborted = new Promise<never>((_, reject) => {
          if (signal.aborted) reject(new Error("aborted"));
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        const response = await Promise.race([
          provider.generate({ ...callRequest, signal }),
          aborted,
        ]);
        const cost = response.usage.reportedCostUsd ?? response.usage.estimatedCostUsd ?? 0;
        spent += cost;
        return {
          response,
          usage: { ...response.usage, latencyMs: response.usage.latencyMs ?? Date.now() - started },
        };
      } catch (err) {
        if (timeout.aborted) {
          await record(operation, "timeout", { latencyMs: Date.now() - started });
          throw new GatewayError("TIMEOUT", "the provider did not answer in time");
        }
        await record(operation, "provider_error", { latencyMs: Date.now() - started });
        const retryable = err instanceof ProviderError ? err.retryable : true;
        if (!retryable)
          throw new GatewayError("SCHEMA_INVALID", "the provider refused the request");
        throw new GatewayError("PROVIDER_ERROR", "provider failure");
      }
    };

    const check = (
      output: unknown,
    ): { ok: true; data: z.infer<S> } | { ok: false; problems: string[]; unknownIds: boolean } => {
      const parsed = request.schema.safeParse(output);
      if (!parsed.success) {
        return {
          ok: false,
          unknownIds: false,
          problems: parsed.error.issues
            .slice(0, 20)
            .map((i) => `${i.path.join(".")}: ${i.message}`),
        };
      }
      const unknown = [...new Set(citedIds(parsed.data))].filter(
        (id) => !context.allowedIds.has(id),
      );
      if (unknown.length > 0) {
        return {
          ok: false,
          unknownIds: true,
          problems: [`unknown identifiers cited: ${unknown.slice(0, 10).join(", ")}`],
        };
      }
      return { ok: true, data: parsed.data };
    };

    const usageFields = (u: {
      inputTokens?: number;
      outputTokens?: number;
      estimatedCostUsd?: number;
      reportedCostUsd?: number;
      latencyMs: number;
    }) => ({
      inputTokens: u.inputTokens ?? null,
      outputTokens: u.outputTokens ?? null,
      estimatedCostUsd: u.estimatedCostUsd ?? null,
      reportedCostUsd: u.reportedCostUsd ?? null,
      latencyMs: u.latencyMs,
    });

    const first = await call("structured_output");
    const firstCheck = check(first.response.output);
    if (firstCheck.ok) {
      await record("structured_output", "ok", usageFields(first.usage));
      return {
        data: firstCheck.data,
        ...base,
        usage: first.usage,
        finishReason: first.response.finishReason,
        repaired: false,
      };
    }
    await record("structured_output", "schema_invalid", usageFields(first.usage));

    // At most one repair call, recorded as operation = 'repair'.
    const second = await call("repair", {
      previousOutput: first.response.output,
      problems: firstCheck.problems,
    });
    const secondCheck = check(second.response.output);
    if (secondCheck.ok) {
      await record("repair", "ok", usageFields(second.usage));
      return {
        data: secondCheck.data,
        ...base,
        usage: { ...second.usage, latencyMs: first.usage.latencyMs + second.usage.latencyMs },
        finishReason: second.response.finishReason,
        repaired: true,
      };
    }
    await record("repair", "schema_invalid", usageFields(second.usage));
    throw new GatewayError(
      secondCheck.unknownIds ? "UNKNOWN_CITED_ID" : "SCHEMA_INVALID",
      secondCheck.problems.join("; ").slice(0, 500),
    );
  }
}
