// discovery_run handler (Implementation Blueprint §6, §11; PD-28): implements
// the Discovery Engine's ports with the database, the official-website
// connector and the AI gateway. The run status follows its job (M8 trigger);
// candidates and the run summary are written through the M8 RPCs.
//
// Search sources are used only when their `sources` row is integrated and
// enabled; Hacker News stays disabled (docs/DATA_SOURCES.md), so the search
// channel reports it as not enabled and no request is made.
import { createHash } from "node:crypto";
import { CatalogFiltersSchema, DiscoveryChannelsSchema } from "@sor/contracts";
import { discoveryRepo, jobsRepo, pipelineRepo, type DbClient, type Json } from "@sor/database";
import {
  DISCOVERY_SOURCES,
  HackerNewsConnector,
  safeJsonFetcher,
  type SafeFetchPolicy,
  type SourceConnector,
} from "@sor/data-sources";
import type { AIGateway } from "@sor/ai-gateway";
import { JobError, normalizeUrl, type FitFacts } from "@sor/domain";
import { runDiscovery, type DiscoveryPorts } from "@sor/discovery-engine";
import type { HandlerContext, HandlerOutcome } from "../runtime";
import { jobBudget } from "./pain";
import { stepRunner } from "./steps";

type JsonValue = NonNullable<Json>;

export interface DiscoveryDeps {
  db: DbClient;
  /** Official-website connector (safe fetcher, robots.txt). */
  officialSite: SourceConnector;
  gateway: AIGateway;
  limits: () => Promise<Record<string, number>>;
  /** Safe-fetch policy for search connectors (JSON APIs). */
  fetchPolicy: SafeFetchPolicy;
  /** Tests inject simulated connectors; production builds them from the registry. */
  searchConnectors?: Record<string, SourceConnector>;
}

const storageStatusOf = (s: "full" | "excerpt" | "reference_only") =>
  s === "full" ? "stored_full" : s === "excerpt" ? "stored_excerpt" : "reference_only";

export function discoveryRunHandler(deps: DiscoveryDeps) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const { db } = deps;
    const runId = (ctx.job.payload as { run_id?: string }).run_id;
    if (!runId) throw new JobError("permanent", "VALIDATION_ERROR", "payload without run_id");
    const row = await discoveryRepo.getRun(db, runId);
    if (!row || row.workspace_id !== ctx.job.workspace_id)
      throw new JobError("permanent", "NOT_FOUND", "discovery run not found");
    const limits = await deps.limits();
    const budget = jobBudget(limits.ai_max_cost_usd_per_job ?? 0);
    let requests = 0;
    const connectors = new Map<string, SourceConnector>();

    const ports: DiscoveryPorts = {
      loadRun: async () => ({
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        explicitFilters: CatalogFiltersSchema.parse(row.explicit_filters ?? {}),
        channels: DiscoveryChannelsSchema.parse(row.channels ?? {}),
        depth: row.depth === "deep" ? "deep" : "standard",
        maxResults: row.max_results,
      }),
      sourceStates: () => discoveryRepo.sourceStates(db, Object.keys(DISCOVERY_SOURCES)),
      searchConnector: (key, maxRequests) => {
        // Called only for sources the registry reports integrated and enabled.
        const injected = deps.searchConnectors?.[key];
        if (injected) return injected;
        if (key !== "hacker_news") return null;
        const hn = new HackerNewsConnector({
          fetchJson: safeJsonFetcher(deps.fetchPolicy),
          maxRequests,
          includeNewStories: row.depth === "deep",
          beforeRequest: () => discoveryRepo.consumeSource(db, key, 1),
        });
        connectors.set(key, hn);
        return hn;
      },
      searchUsage: (key) => {
        const c = connectors.get(key);
        return c instanceof HackerNewsConnector ? c.getUsage() : null;
      },
      fetchOfficialPage: async (url) => {
        requests += 1;
        return deps.officialSite.fetchDocument(url, ctx.signal);
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
          storageStatus: storageStatusOf(doc.storage_permitted),
          metadata: {
            description: (doc.metadata.description as string | null) ?? null,
          } as JsonValue,
        }),
      recordLead: async (lead) => {
        // Metadata only (docs/DATA_SOURCES.md): a reference snapshot of the
        // source page with the allowed fields; never user text or usernames.
        if (lead.storage_policy === "transient" || lead.channel !== "search") return null;
        const reference = lead.source_reference_url ?? lead.lead_url;
        const meta = {
          lead_url: lead.lead_url,
          title: lead.title,
          published_at: lead.published_at,
          query: lead.query,
        };
        return pipelineRepo.recordSnapshot(db, {
          sourceKey: lead.source_key,
          canonicalUrl: reference,
          externalId: lead.external_id,
          title: lead.title,
          contentHash: createHash("sha256").update(JSON.stringify(meta)).digest("hex"),
          fetchStatus: "ok",
          httpStatus: null,
          publishedAt: lead.published_at,
          retrievedAt: lead.retrieved_at,
          storageStatus: "reference_only",
          metadata: meta as JsonValue,
        });
      },
      loadSeeds: (args) => discoveryRepo.loadSeeds(db, args),
      identityLookup: async (c) => {
        const url = c.officialUrl ? normalizeUrl(c.officialUrl) : null;
        return pipelineRepo.identityLookups(db, {
          canonicalUrl: url?.canonicalUrl ?? "",
          registrableDomain: url?.registrableDomain ?? null,
          name: c.name,
        });
      },
      catalogFacts: async (productId) =>
        (await discoveryRepo.fitFacts(db, productId)) as FitFacts | null,
      categoryClosure: (slugs) => discoveryRepo.categoryClosure(db, slugs),
      setStage: (stage) => discoveryRepo.setStage(db, runId, stage),
      savePlan: (args) =>
        discoveryRepo.savePlan(db, {
          runId,
          interpretedFilters: args.interpretedFilters as unknown as JsonValue,
          queryPlan: args.queryPlan as JsonValue,
          limitations: args.limitations as unknown as JsonValue,
        }),
      upsertCandidate: (payload) =>
        discoveryRepo.upsertCandidate(db, runId, payload as unknown as JsonValue),
      finalize: (summary) => discoveryRepo.finalizeRun(db, runId, summary as unknown as JsonValue),
      step: stepRunner(db, ctx.job),
      gateway: deps.gateway,
      remainingAiBudgetUsd: () => budget.remaining(),
      recordUsage: async (stepId, u) => {
        if (u.outcome !== "budget_refused")
          budget.spend(u.reportedCostUsd ?? u.estimatedCostUsd ?? 0);
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
      now: () => new Date(),
      signal: ctx.signal,
    };

    const outcome = await runDiscovery(ports);
    return {
      state: outcome.state,
      terminalReason: outcome.terminalReason,
      result: {
        leads_found: outcome.summary.leads_found,
        candidates_found: outcome.summary.candidates_found,
        duplicates_removed: outcome.summary.duplicates_removed,
        candidates: outcome.summary.candidates.length,
        limitations: outcome.summary.limitations,
        warnings: outcome.summary.warnings,
        provider: deps.gateway.providerId,
      },
      usage: { ai_cost_usd: budget.spent(), external_requests: requests },
    };
  };
}
