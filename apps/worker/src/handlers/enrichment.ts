// product_enrichment handler: implements the engine's ports with the
// database, the official-website connector and the AI gateway.
import { pipelineRepo, jobsRepo, type DbClient, type Json } from "@sor/database";
import type { SourceConnector } from "@sor/data-sources";
import type { AIGateway } from "@sor/ai-gateway";
import { JobError } from "@sor/domain";
import { runEnrichment, type ExistingClaim, type EnrichmentPorts } from "@sor/discovery-engine";
import type { HandlerContext, HandlerOutcome } from "../runtime";
import { stepRunner } from "./steps";

export interface EnrichmentDeps {
  db: DbClient;
  connector: SourceConnector;
  gateway: AIGateway;
  limits: () => Promise<Record<string, number>>;
}

const COMPANY_FIELDS = new Set([
  "legal_name",
  "founded_year",
  "country_code",
  "city",
  "employee_min",
  "employee_max",
  "founder_led",
  "linkedin_url",
  "employee_count",
]);

export function enrichmentHandler(deps: EnrichmentDeps) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const { db } = deps;
    const productId = (ctx.job.payload as { product_id?: string }).product_id;
    if (!productId)
      throw new JobError("permanent", "VALIDATION_ERROR", "payload without product_id");
    const limits = await deps.limits();
    const maxPages = limits.enrichment_max_pages ?? 5;
    const maxRequests = maxPages + 2; // pages + robots.txt
    const aiBudget = limits.ai_max_cost_usd_per_job ?? 0;
    let requests = 0;
    let spentUsd = 0;

    const product = await pipelineRepo.loadProductForEnrichment(db, productId);
    if (!product) throw new JobError("permanent", "NOT_FOUND", "product not found");
    if (product.record_status !== "active" || product.exclusion_status !== "eligible") {
      throw new JobError("permanent", "EXCLUDED_SUBJECT", "product is not visible");
    }
    if (!product.website_url)
      throw new JobError("permanent", "VALIDATION_ERROR", "product has no official URL");

    const ports: EnrichmentPorts = {
      loadProduct: async () => ({
        id: product.id,
        name: product.name,
        website_url: product.website_url as string,
        company_id: product.company_id,
        primary_category_slugs: (product.product_categories ?? []).flatMap((pc) =>
          pc.is_primary && pc.categories ? [pc.categories.slug] : [],
        ),
        tagline: product.tagline,
        short_description: product.short_description,
        description: product.description,
      }),
      loadExistingClaims: async () => {
        const rows = await pipelineRepo.loadCurrentClaims(db, product.id, product.company_id);
        const values = await pipelineRepo.currentValues(db, product.id);
        return rows.flatMap((r): ExistingClaim[] => {
          const ev = r.evidence_items;
          if (!ev) return [];
          const fieldKey = r.field_key;
          const fromEvidence = (ev.claim_value as { value?: unknown } | null)?.value;
          const fromRow = COMPANY_FIELDS.has(fieldKey)
            ? (values?.companies as Record<string, unknown> | null)?.[fieldKey]
            : (values as Record<string, unknown> | null)?.[fieldKey];
          return [
            {
              field_key: fieldKey,
              value: fromEvidence ?? fromRow ?? null,
              evidence_id: ev.id,
              verification_status: ev.verification_status,
              fact_status: ev.fact_status,
              reliability_level: ev.reliability_level as 1 | 2 | 3 | 4,
              observed_at: ev.observed_at,
            },
          ];
        });
      },
      step: stepRunner(db, ctx.job, ctx.signal),
      fetchDocument: async (url) => {
        requests += 1;
        if (requests > maxRequests)
          return { status: "rate_limited", reason: "request_budget_exhausted", retryable: false };
        return deps.connector.fetchDocument(url, ctx.signal);
      },
      recordSnapshot: (doc) =>
        pipelineRepo.recordSnapshot(db, {
          sourceKey: doc.source_key,
          canonicalUrl: doc.canonical_url,
          externalId: doc.external_id,
          title: doc.title,
          contentHash: doc.content_hash,
          fetchStatus: doc.fetch_status,
          httpStatus: doc.http_status,
          publishedAt: doc.published_at,
          retrievedAt: doc.retrieved_at,
          storageStatus:
            doc.storage_permitted === "full"
              ? "stored_full"
              : doc.storage_permitted === "excerpt"
                ? "stored_excerpt"
                : "reference_only",
          metadata: {
            description: (doc.metadata.description as string | null) ?? null,
          } as Json as NonNullable<Json>,
        }),
      applyPlan: (stepId, plan) =>
        pipelineRepo.applyEnrichment(db, {
          jobId: ctx.job.id,
          stepId,
          productId: product.id,
          plan: plan as unknown as NonNullable<Json>,
        }),
      gateway: deps.gateway,
      remainingAiBudgetUsd: () => Math.max(0, aiBudget - spentUsd),
      recordUsage: async (stepId, u) => {
        spentUsd += u.reportedCostUsd ?? u.estimatedCostUsd ?? 0;
        await jobsRepo.recordProviderUsage(db, {
          workspace_id: ctx.job.workspace_id,
          job_execution_id: ctx.job.id,
          agent_step_run_id: stepId,
          provider: u.provider,
          model: u.model,
          operation: u.operation,
          input_tokens: u.inputTokens,
          output_tokens: u.outputTokens,
          estimated_cost_usd: u.estimatedCostUsd,
          reported_cost_usd: u.reportedCostUsd,
          latency_ms: u.latencyMs,
          outcome: u.outcome,
        });
      },
      stopReason: () =>
        ctx.cancelRequested() ? "cancelled" : Date.now() > ctx.deadline.getTime() ? "budget" : null,
      maxPages,
      maxAgeDays: limits.evidence_max_age_days ?? 365,
      now: () => new Date(),
      signal: ctx.signal,
    };

    const outcome = await runEnrichment(ports);
    return {
      state: outcome.state,
      terminalReason: outcome.terminalReason,
      result: { ...outcome.summary },
      usage: { ai_cost_usd: spentUsd, external_requests: requests },
    };
  };
}
