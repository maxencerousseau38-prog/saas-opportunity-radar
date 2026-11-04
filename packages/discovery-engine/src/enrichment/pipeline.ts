// product_enrichment pipeline: fetch official pages → D5 extract → D6 verify
// → apply (Implementation Blueprint §6.6–6.7, §11). Every step is persisted
// and keyed; a resumed job reuses completed steps instead of repeating them.
import { createHash } from "node:crypto";
import {
  ENRICHMENT_CONTRACT_VERSION,
  EnrichmentOutputSchema,
  VERIFICATION_CONTRACT_VERSION,
  VerificationOutputSchema,
  type EnrichmentOutput,
  type VerificationOutput,
} from "@sor/contracts";
import { selectEnrichmentPages } from "@sor/data-sources";
import { GatewayError } from "@sor/ai-gateway";
import { buildPlan } from "./plan";
import {
  D5_AGENT_KEY,
  D5_INSTRUCTIONS,
  D5_PROMPT_VERSION,
  D6_AGENT_KEY,
  D6_INSTRUCTIONS,
  D6_PROMPT_VERSION,
} from "./prompts";
import type {
  EnrichmentOutcome,
  EnrichmentPorts,
  EnrichmentSummary,
  FetchedSnapshot,
} from "./types";
import { itemsOf, verifyEnrichment } from "./verify";

const FETCH_AGENT = "official_website_fetch";
const APPLY_AGENT = "enrichment_apply";

export const hashOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type FetchStep =
  | { snapshot: FetchedSnapshot }
  | { failure: { status: string; reason: string; retryable: boolean } };

class StopSignal extends Error {
  constructor(readonly reason: "cancelled" | "budget") {
    super(reason);
  }
}

export async function runEnrichment(ports: EnrichmentPorts): Promise<EnrichmentOutcome> {
  const summary: EnrichmentSummary = {
    pages_fetched: 0,
    pages_failed: [],
    claims_proposed: 0,
    verified: 0,
    needs_review: 0,
    rejected: 0,
    stale: 0,
    fields_updated: [],
    unknown_fields: [],
    conflicts: 0,
    exclusion_status: null,
    provider: null,
    warnings: [],
  };
  const checkpoint = () => {
    const reason = ports.stopReason();
    if (reason) throw new StopSignal(reason);
  };

  try {
    const product = await ports.loadProduct();

    const fetchPage = async (url: string, stepKey: string): Promise<FetchedSnapshot | null> => {
      checkpoint();
      const res = await ports.step<FetchStep>(
        {
          agentKey: FETCH_AGENT,
          stepKey,
          contractVersion: "fetch.v1",
          promptVersion: null,
          inputHash: hashOf(url),
        },
        async () => {
          const doc = await ports.fetchDocument(url);
          if (doc.status !== "ok") {
            // Transient failures are retried by the job; permanent ones are recorded as such.
            if (doc.retryable)
              throw Object.assign(new Error(doc.reason), {
                code: `FETCH_${doc.status.toUpperCase()}`,
              });
            return {
              output: { failure: { status: doc.status, reason: doc.reason, retryable: false } },
            };
          }
          const snapshotId = await ports.recordSnapshot(doc.data);
          const links = Array.isArray(doc.data.metadata.links)
            ? (doc.data.metadata.links as string[])
            : [];
          return {
            output: {
              snapshot: {
                snapshot_id: snapshotId,
                url: doc.data.canonical_url,
                title: doc.data.title,
                text: doc.data.text,
                retrieved_at: doc.data.retrieved_at,
                published_at: doc.data.published_at,
                links,
              },
            },
          };
        },
      );
      if ("failure" in res.output) {
        summary.pages_failed.push({
          url,
          status: res.output.failure.status,
          reason: res.output.failure.reason,
        });
        return null;
      }
      summary.pages_fetched++;
      return res.output.snapshot;
    };

    const home = await fetchPage(product.website_url, "page:0");
    if (!home) {
      summary.warnings.push("official_site_unreachable");
      return { state: "partial", terminalReason: "partial", summary };
    }
    const snapshots: FetchedSnapshot[] = [home];
    const pages = selectEnrichmentPages(
      {
        source_key: "official_website",
        canonical_url: home.url,
        external_id: null,
        title: home.title,
        text: "",
        published_at: null,
        retrieved_at: home.retrieved_at,
        content_hash: "0".repeat(64),
        fetch_status: "ok",
        http_status: 200,
        storage_permitted: "excerpt",
        metadata: { links: home.links },
      },
      Math.max(0, ports.maxPages - 1),
    );
    for (const [i, url] of pages.entries()) {
      const snap = await fetchPage(url, `page:${i + 1}`);
      if (snap) snapshots.push(snap);
    }

    const allowedIds = new Set(snapshots.map((s) => s.snapshot_id));
    const untrusted = snapshots.map((s) => ({ label: s.url, ref: s.snapshot_id, text: s.text }));

    checkpoint();
    const d5 = await ports.step<EnrichmentOutput>(
      {
        agentKey: D5_AGENT_KEY,
        stepKey: "extract",
        contractVersion: ENRICHMENT_CONTRACT_VERSION,
        promptVersion: D5_PROMPT_VERSION,
        inputHash: hashOf(snapshots.map((s) => s.snapshot_id)),
      },
      async (stepId) => {
        const res = await ports.gateway.generate(
          {
            agentKey: D5_AGENT_KEY,
            contractVersion: ENRICHMENT_CONTRACT_VERSION,
            promptVersion: D5_PROMPT_VERSION,
            systemInstructions: D5_INSTRUCTIONS,
            untrustedInputs: untrusted,
            trustedInput: { product: { name: product.name, website_url: product.website_url } },
            schema: EnrichmentOutputSchema,
            modelProfile: "fast_extraction",
            maxOutputTokens: 4000,
            timeoutMs: 90_000,
            maxCostUsd: ports.remainingAiBudgetUsd(),
          },
          {
            remainingBudgetUsd: ports.remainingAiBudgetUsd(),
            allowedIds,
            recordUsage: (u) => ports.recordUsage(stepId, u),
            signal: ports.signal,
          },
        );
        return {
          output: res.data,
          warnings: res.data.warnings,
          model: {
            provider: res.provider,
            name: res.model,
            ...(res.usage.inputTokens !== undefined ? { inputTokens: res.usage.inputTokens } : {}),
            ...(res.usage.outputTokens !== undefined
              ? { outputTokens: res.usage.outputTokens }
              : {}),
            costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
            latencyMs: res.usage.latencyMs,
          },
        };
      },
    );
    const output = d5.output;
    summary.claims_proposed = itemsOf(output).length;
    summary.unknown_fields = output.unknown_fields;
    summary.warnings.push(...output.warnings);

    checkpoint();
    const items = itemsOf(output).map((i) => ({
      ref: i.ref,
      quote: i.quote,
      source_snapshot_id: i.snapshotId,
    }));
    const d6 = await ports.step<VerificationOutput>(
      {
        agentKey: D6_AGENT_KEY,
        stepKey: "verify",
        contractVersion: VERIFICATION_CONTRACT_VERSION,
        promptVersion: D6_PROMPT_VERSION,
        inputHash: hashOf({ d5: d5.stepId, items }),
      },
      async (stepId) => {
        if (items.length === 0) return { output: { judgments: [] } };
        const res = await ports.gateway.generate(
          {
            agentKey: D6_AGENT_KEY,
            contractVersion: VERIFICATION_CONTRACT_VERSION,
            promptVersion: D6_PROMPT_VERSION,
            systemInstructions: D6_INSTRUCTIONS,
            untrustedInputs: untrusted,
            trustedInput: { items },
            schema: VerificationOutputSchema,
            modelProfile: "verification",
            maxOutputTokens: 4000,
            timeoutMs: 90_000,
            maxCostUsd: ports.remainingAiBudgetUsd(),
          },
          {
            remainingBudgetUsd: ports.remainingAiBudgetUsd(),
            allowedIds,
            recordUsage: (u) => ports.recordUsage(stepId, u),
            signal: ports.signal,
          },
        );
        return {
          output: res.data,
          model: {
            provider: res.provider,
            name: res.model,
            costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
            latencyMs: res.usage.latencyMs,
          },
        };
      },
    );
    summary.provider = ports.gateway.providerId;

    const verified = verifyEnrichment(output, d6.output, snapshots, {
      now: ports.now(),
      maxAgeDays: ports.maxAgeDays,
    });
    for (const v of verified) {
      if (v.status === "verified") summary.verified++;
      else if (v.status === "rejected") summary.rejected++;
      else if (v.status === "stale") summary.stale++;
      else summary.needs_review++;
    }

    checkpoint();
    const existing = await ports.loadExistingClaims();
    const built = buildPlan(output, verified, existing, product, ports.now());
    summary.fields_updated = built.fieldsUpdated;
    summary.conflicts = built.conflicts;
    summary.exclusion_status = built.plan.exclusion.status;
    await ports.step(
      {
        agentKey: APPLY_AGENT,
        stepKey: "apply",
        contractVersion: "apply.v1",
        promptVersion: null,
        inputHash: hashOf({ d6: d6.stepId, verified: verified.map((v) => [v.ref, v.status]) }),
      },
      async (stepId) => {
        const applied = await ports.applyPlan(stepId, built.plan);
        return {
          output: { ...applied, fields_updated: built.fieldsUpdated, conflicts: built.conflicts },
        };
      },
    );
    const partial = summary.pages_failed.length > 0;
    return {
      state: partial ? "partial" : "completed",
      terminalReason: partial ? "partial" : "completed",
      summary,
    };
  } catch (err) {
    if (err instanceof StopSignal) {
      return err.reason === "cancelled"
        ? { state: "cancelled", terminalReason: "cancelled", summary }
        : { state: "partial", terminalReason: "budget_exhausted", summary };
    }
    if (err instanceof GatewayError && err.code === "BUDGET_EXHAUSTED") {
      summary.warnings.push("ai_budget_exhausted");
      return { state: "partial", terminalReason: "budget_exhausted", summary };
    }
    throw err;
  }
}
