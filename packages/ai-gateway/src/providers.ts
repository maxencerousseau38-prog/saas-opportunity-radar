// Real provider adapters (PD-24a benchmark; ADR-006): Anthropic Messages API,
// OpenAI Responses API, Mistral chat completions. Plain HTTPS (no SDK), one
// structured-output call each; validation, repair and budgets stay in the
// gateway. Request shapes follow the vendors' official documentation
// (evals/benchmark/vendor-docs). Keys come from the caller and are only sent
// in the authorization header of the vendor's own endpoint.
import { jsonSchemaFor, assemblePrompt, type SchemaDialect } from "./prompt";
import { postJson, parseModelJson, type FetchLike } from "./http";
import { costUsd, worstCaseCostUsd, type ModelPricing } from "./pricing";
import {
  ProviderError,
  type AIProvider,
  type EmbeddingResult,
  type ProviderCall,
  type ProviderResponse,
} from "./provider";
import type { z } from "zod";

export interface HttpProviderOptions {
  apiKey: string;
  /** Prices of every model this provider may be asked for (USD per million tokens). */
  pricing: Record<string, ModelPricing>;
  /** Overrides the vendor endpoint (e.g. a regional one). */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Retry delay function (tests). */
  sleep?: (ms: number) => Promise<void>;
}

abstract class HttpProvider implements AIProvider {
  abstract readonly id: string;
  protected abstract readonly dialect: SchemaDialect;

  constructor(protected readonly options: HttpProviderOptions) {
    if (!options.apiKey) throw new Error("missing API key");
  }

  protected pricingOf(model: string): ModelPricing {
    const p = this.options.pricing[model];
    if (!p) throw new ProviderError(`no pricing configured for model ${model}`, false);
    return p;
  }

  protected schemaOf(call: Pick<ProviderCall, "request">): Record<string, unknown> {
    return jsonSchemaFor(call.request.schema as z.ZodType, this.dialect);
  }

  estimateMaxCostUsd(call: Omit<ProviderCall, "signal">): number {
    const schema = JSON.stringify(this.schemaOf(call));
    const prompt = assemblePrompt(call, schema);
    return worstCaseCostUsd(
      this.pricingOf(call.model),
      prompt.chars,
      call.settings.maxOutputTokens,
    );
  }

  protected post(
    path: string,
    headers: Record<string, string>,
    body: unknown,
    signal: AbortSignal,
  ) {
    return postJson(`${this.baseUrl()}${path}`, headers, body, {
      signal,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
    });
  }

  protected abstract baseUrl(): string;
  abstract generate(call: ProviderCall): Promise<ProviderResponse>;

  async embed(): Promise<EmbeddingResult> {
    throw new ProviderError(`${this.id}: embeddings are out of scope (PD-24b)`, false);
  }
}

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Anthropic Messages API with `output_config.format` JSON-schema outputs. */
export class AnthropicProvider extends HttpProvider {
  readonly id = "anthropic";
  protected readonly dialect = "anthropic" as const;

  protected baseUrl(): string {
    return this.options.baseUrl ?? "https://api.anthropic.com";
  }

  async generate(call: ProviderCall): Promise<ProviderResponse> {
    const schema = this.schemaOf(call);
    const prompt = assemblePrompt(call, JSON.stringify(schema));
    const outputConfig: Json = { format: { type: "json_schema", schema } };
    if (call.settings.reasoningEffort) outputConfig.effort = call.settings.reasoningEffort;
    const body: Json = {
      model: call.model,
      max_tokens: call.settings.maxOutputTokens,
      system: prompt.system,
      messages: prompt.turns.map((t) => ({ role: t.role, content: t.text })),
      output_config: outputConfig,
    };
    if (call.settings.thinking) body.thinking = { type: call.settings.thinking };
    const started = Date.now();
    const res = (await this.post(
      "/v1/messages",
      { "x-api-key": this.options.apiKey, "anthropic-version": "2023-06-01" },
      body,
      call.signal,
    )) as Json;
    const latencyMs = Date.now() - started;
    const usage = (res.usage ?? {}) as Json;
    const tokens = {
      inputTokens: num(usage.input_tokens),
      cacheReadTokens: num(usage.cache_read_input_tokens),
      cacheWriteTokens: num(usage.cache_creation_input_tokens),
      outputTokens: num(usage.output_tokens),
    };
    const stop = res.stop_reason;
    if (stop === "refusal") throw new ProviderError("anthropic: refusal", false);
    const text = ((res.content as Json[] | undefined) ?? [])
      .filter((b) => b.type === "text")
      .map((b) => String(b.text ?? ""))
      .join("");
    return {
      output: parseModelJson(text),
      usage: {
        inputTokens: tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens,
        outputTokens: tokens.outputTokens,
        estimatedCostUsd: costUsd(this.pricingOf(call.model), tokens),
        latencyMs,
      },
      finishReason: stop === "end_turn" ? "stop" : stop === "max_tokens" ? "length" : "unknown",
    };
  }
}

/** OpenAI Responses API with strict `text.format` JSON-schema outputs; nothing stored. */
export class OpenAIProvider extends HttpProvider {
  readonly id = "openai";
  protected readonly dialect = "openai" as const;

  protected baseUrl(): string {
    return this.options.baseUrl ?? "https://api.openai.com";
  }

  async generate(call: ProviderCall): Promise<ProviderResponse> {
    const schema = this.schemaOf(call);
    const prompt = assemblePrompt(call, JSON.stringify(schema));
    const body: Json = {
      model: call.model,
      instructions: prompt.system,
      input: prompt.turns.map((t) => ({ role: t.role, content: t.text })),
      text: { format: { type: "json_schema", name: "output", schema, strict: true } },
      max_output_tokens: call.settings.maxOutputTokens,
      store: false,
    };
    if (call.settings.reasoningEffort) body.reasoning = { effort: call.settings.reasoningEffort };
    const started = Date.now();
    const res = (await this.post(
      "/v1/responses",
      { authorization: `Bearer ${this.options.apiKey}` },
      body,
      call.signal,
    )) as Json;
    const latencyMs = Date.now() - started;
    const usage = (res.usage ?? {}) as Json;
    const cached = num((usage.input_tokens_details as Json | undefined)?.cached_tokens);
    const input = num(usage.input_tokens);
    const tokens = {
      inputTokens: Math.max(0, input - cached),
      cacheReadTokens: cached,
      outputTokens: num(usage.output_tokens),
    };
    let text = "";
    for (const item of (res.output as Json[] | undefined) ?? []) {
      if (item.type !== "message") continue;
      for (const part of (item.content as Json[] | undefined) ?? []) {
        if (part.type === "refusal") throw new ProviderError("openai: refusal", false);
        if (part.type === "output_text") text += String(part.text ?? "");
      }
    }
    const incomplete = (res.incomplete_details as Json | undefined)?.reason;
    return {
      output: parseModelJson(text),
      usage: {
        inputTokens: input,
        outputTokens: tokens.outputTokens,
        estimatedCostUsd: costUsd(this.pricingOf(call.model), tokens),
        latencyMs,
      },
      finishReason:
        res.status === "completed"
          ? "stop"
          : incomplete === "max_output_tokens"
            ? "length"
            : "unknown",
    };
  }
}

/** Mistral chat completions with `response_format` JSON-schema outputs. */
export class MistralProvider extends HttpProvider {
  readonly id = "mistral";
  protected readonly dialect = "mistral" as const;

  protected baseUrl(): string {
    return this.options.baseUrl ?? "https://api.mistral.ai";
  }

  async generate(call: ProviderCall): Promise<ProviderResponse> {
    const schema = this.schemaOf(call);
    const prompt = assemblePrompt(call, JSON.stringify(schema));
    const body: Json = {
      model: call.model,
      messages: [
        { role: "system", content: prompt.system },
        ...prompt.turns.map((t) => ({ role: t.role, content: t.text })),
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "output", schema, strict: true },
      },
      max_tokens: call.settings.maxOutputTokens,
    };
    if (call.settings.reasoningEffort) body.reasoning_effort = call.settings.reasoningEffort;
    const started = Date.now();
    const res = (await this.post(
      "/v1/chat/completions",
      { authorization: `Bearer ${this.options.apiKey}` },
      body,
      call.signal,
    )) as Json;
    const latencyMs = Date.now() - started;
    const usage = (res.usage ?? {}) as Json;
    const cached = num((usage.prompt_tokens_details as Json | undefined)?.cached_tokens);
    const prompt_ = num(usage.prompt_tokens);
    const tokens = {
      inputTokens: Math.max(0, prompt_ - cached),
      cacheReadTokens: cached,
      outputTokens: num(usage.completion_tokens),
    };
    const choice = ((res.choices as Json[] | undefined) ?? [])[0] ?? {};
    const content = (choice.message as Json | undefined)?.content;
    // With reasoning, content is a list of chunks (thinking + text); otherwise a string.
    const text = Array.isArray(content)
      ? (content as Json[])
          .filter((c) => c.type === "text")
          .map((c) => String(c.text ?? ""))
          .join("")
      : typeof content === "string"
        ? content
        : "";
    const finish = choice.finish_reason;
    return {
      output: parseModelJson(text),
      usage: {
        inputTokens: prompt_,
        outputTokens: tokens.outputTokens,
        estimatedCostUsd: costUsd(this.pricingOf(call.model), tokens),
        latencyMs,
      },
      finishReason: finish === "stop" ? "stop" : finish === "length" ? "length" : "unknown",
    };
  }
}
