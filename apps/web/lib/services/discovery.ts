// Discovery services (Implementation Blueprint §6.4, §6.9, §10 "Discovery").
// Runs and candidates are read with the user's client (RLS: members only);
// candidate products (record_status 'candidate', invisible through catalog
// RLS) and their evidence are read with the service client after the
// workspace check. The browser never writes a run or a candidate: a request
// creates a job (202) and reviews go through a service-role RPC.
import "server-only";
import type { DiscoveryRequest } from "@sor/contracts";
import { discoveryRepo, workspaceRepo, type DbClient } from "@sor/database";
import { assertSupportedQuery } from "@sor/domain";
import { ApiError } from "@/lib/api/http";
import { requestHash } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

const RUN_COLUMNS =
  "id, title, prompt, explicit_filters, interpreted_filters, channels, depth, max_results, status, stage, leads_found, candidates_found, duplicates_removed, candidates_retained, candidates_rejected, candidates_needs_review, sources_report, limitations, error_summary, terminal_reason, rerun_of_run_id, job_execution_id, orchestrator_version, fit_rules_version, started_at, completed_at, created_at";
const LIST_COLUMNS =
  "id, title, prompt, depth, status, candidates_found, candidates_retained, duplicates_removed, created_at, completed_at";

function check<T>(res: { data: T; error: { message?: string; code?: string } | null }): T {
  if (res.error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: res.error.code });
  return res.data;
}
function list<T>(res: {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}): T[] {
  return check(res) ?? [];
}
const runUrl = (ws: string, id: string) => `/api/v1/workspaces/${ws}/discovery-runs/${id}`;

function accepted(workspaceId: string, runId: string, jobId: string, created: boolean) {
  return Response.json(
    {
      data: {
        id: runId,
        job_id: jobId,
        status: "queued",
        status_url: `${runUrl(workspaceId, runId)}/progress`,
        created,
      },
    },
    { status: 202 },
  );
}

// ------------------------------------------------------------------ requests

export async function requestDiscovery(args: {
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  body: DiscoveryRequest;
}) {
  // Phase 2 filter groups are refused, never silently ignored.
  assertSupportedQuery(args.body.filters, "relevance");
  const res = await discoveryRepo.requestDiscoveryRun(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("discovery_run", args.body),
    request: args.body as never,
  });
  return accepted(args.workspaceId, res.runId, res.jobId, res.created);
}

export async function listRuns(
  client: DbClient,
  workspaceId: string,
  query: { limit: number; cursor?: string | undefined },
) {
  let q = client
    .from("discovery_runs")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);
  if (query.cursor) {
    const [at, id] = query.cursor.split("|");
    if (!at || !id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(Date.parse(at)))
      throw new ApiError("VALIDATION_ERROR", "Curseur invalide");
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const rows = list(await q);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: page,
    next_cursor: rows.length > query.limit && last ? `${last.created_at}|${last.id}` : null,
  };
}

export async function getRun(client: DbClient, workspaceId: string, runId: string) {
  const run = check(
    await client
      .from("discovery_runs")
      .select(RUN_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", runId)
      .maybeSingle(),
  );
  if (!run) throw new ApiError("NOT_FOUND");
  const duration =
    run.started_at && run.completed_at
      ? Math.max(0, Math.round((Date.parse(run.completed_at) - Date.parse(run.started_at)) / 1000))
      : null;
  return { ...run, duration_seconds: duration };
}

const STAGE_LABELS = [
  "planning",
  "searching",
  "extracting",
  "resolving_identity",
  "classifying_exclusion",
  "filtering",
  "ranking",
  "persisting",
] as const;

export async function runProgress(client: DbClient, workspaceId: string, runId: string) {
  const r = await getRun(client, workspaceId, runId);
  return {
    id: r.id,
    status: r.status,
    stage: r.stage,
    stage_index: r.stage
      ? STAGE_LABELS.indexOf(r.stage as (typeof STAGE_LABELS)[number]) + 1
      : null,
    stage_count: STAGE_LABELS.length,
    candidates_found: r.candidates_found,
    started_at: r.started_at,
    completed_at: r.completed_at,
  };
}

/** Candidates with their product DTO and evidence (PRD §6.3 étape 6, §6.4). */
export async function runResults(client: DbClient, workspaceId: string, runId: string) {
  await getRun(client, workspaceId, runId);
  const candidates = list(
    await client
      .from("discovery_candidates")
      .select(
        "id, product_id, identity_decision, possible_duplicate_of_product_id, is_new_to_catalog, exclusion_status_at_run, fit_score, fit_coverage, fit_breakdown, confidence_score, recommendation_reason, missing_information, provenance, review_status, rejection_reason, reviewed_at, discovery_candidate_evidence(evidence_item_id)",
      )
      .eq("run_id", runId)
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("confidence_score", { ascending: false, nullsFirst: false })
      .order("id"),
  );
  const service = getServiceClient();
  const productIds = [...new Set(candidates.map((c) => c.product_id))];
  const products = productIds.length
    ? list(
        await service
          .from("saas_products")
          .select("id, name, slug, website_url, tagline, record_status, exclusion_status")
          .in("id", productIds),
      )
    : [];
  const evidenceIds = [
    ...new Set(
      candidates.flatMap((c) => c.discovery_candidate_evidence.map((e) => e.evidence_item_id)),
    ),
  ];
  const evidence = evidenceIds.length
    ? list(
        await service
          .from("evidence_items")
          .select(
            "id, claim_type, claim_text, reliability_level, fact_status, verification_status, observed_at, source_snapshots(retrieved_at, source_records(canonical_url, sources(name)))",
          )
          .in("id", evidenceIds),
      )
    : [];
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const byEvidence = new Map(evidence.map((e) => [e.id, e]));
  return {
    data: candidates.map(({ discovery_candidate_evidence, ...c }) => {
      const p = byProduct.get(c.product_id);
      return {
        ...c,
        product: p
          ? {
              id: p.id,
              name: p.name,
              website_url: p.website_url,
              tagline: p.tagline,
              // A product is linked to its profile only once visible in Discover.
              profile_slug:
                p.record_status === "active" && p.exclusion_status === "eligible" ? p.slug : null,
              record_status: p.record_status,
              exclusion_status: p.exclusion_status,
            }
          : null,
        evidence: discovery_candidate_evidence.flatMap((link) => {
          const e = byEvidence.get(link.evidence_item_id);
          if (!e) return [];
          const snap = e.source_snapshots as unknown as {
            retrieved_at: string;
            source_records: { canonical_url: string; sources: { name: string } | null } | null;
          } | null;
          return [
            {
              id: e.id,
              claim_type: e.claim_type,
              claim_text: e.claim_text,
              reliability_level: e.reliability_level,
              fact_status: e.fact_status,
              verification_status: e.verification_status,
              source_url: snap?.source_records?.canonical_url ?? null,
              source_name: snap?.source_records?.sources?.name ?? null,
              retrieved_at: snap?.retrieved_at ?? null,
            },
          ];
        }),
      };
    }),
  };
}

async function jobOf(client: DbClient, workspaceId: string, runId: string): Promise<string> {
  const r = await getRun(client, workspaceId, runId);
  if (!r.job_execution_id) throw new ApiError("INVALID_STATE");
  return r.job_execution_id;
}

export async function cancelRun(
  client: DbClient,
  workspaceId: string,
  userId: string,
  runId: string,
) {
  const jobId = await jobOf(client, workspaceId, runId);
  const state = check(
    await getServiceClient().rpc("sor_cancel_job", {
      p_job_id: jobId,
      p_workspace_id: workspaceId,
      p_actor: userId,
    }),
  );
  return { data: { id: runId, job_state: state } };
}

export async function retryRun(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  runId: string;
  idempotencyKey: string;
}) {
  await getRun(args.client, args.workspaceId, args.runId);
  const res = await discoveryRepo.retryDiscoveryRun(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    runId: args.runId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("discovery_run_retry", { run_id: args.runId }),
  });
  return accepted(args.workspaceId, args.runId, res.jobId, res.created);
}

export async function deleteRun(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  runId: string;
  requestId: string;
}) {
  await getRun(args.client, args.workspaceId, args.runId);
  await discoveryRepo.deleteDiscoveryRun(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    runId: args.runId,
    requestId: args.requestId,
  });
}

/** Saves the run's prompt and explicit filters as a `discovery` saved search (PRD §6.4). */
export async function saveRun(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  runId: string;
  name: string;
}) {
  const run = await getRun(args.client, args.workspaceId, args.runId);
  const saved = await workspaceRepo.createSavedSearch(args.client, args.workspaceId, args.userId, {
    name: args.name,
    kind: "discovery",
    search_text: run.prompt,
    filters: run.explicit_filters as never,
    sort_key: "relevance",
    is_pinned: false,
  });
  return { data: saved };
}

export async function reviewCandidate(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  runId: string;
  candidateId: string;
  decision: "accept" | "reject";
  reason: string | null;
  requestId: string;
}) {
  await getRun(args.client, args.workspaceId, args.runId);
  const own = check(
    await args.client
      .from("discovery_candidates")
      .select("id")
      .eq("id", args.candidateId)
      .eq("run_id", args.runId)
      .maybeSingle(),
  );
  if (!own) throw new ApiError("NOT_FOUND");
  const res = await discoveryRepo.reviewCandidate(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    candidateId: args.candidateId,
    decision: args.decision,
    reason: args.reason,
    requestId: args.requestId,
  });
  return { data: res };
}

/** PRD §14.3: sources, connector status, last use, errors, limits and today's usage. */
export async function listSources() {
  const service = getServiceClient();
  const rows = list(
    await service
      .from("sources")
      .select(
        "id, source_key, name, source_type, access_method, integration_status, is_enabled, default_reliability_level, storage_policy, terms_url, terms_reviewed_at, rate_limit_per_minute, quota_per_day, last_sync_at, last_error_code, last_error_at",
      )
      .order("name"),
  );
  const today = new Date().toISOString().slice(0, 10);
  const usage = list(
    await service.from("source_usage_daily").select("source_id, requests").eq("usage_date", today),
  );
  const used = new Map(usage.map((u) => [u.source_id, u.requests]));
  return {
    data: rows.map(({ id, ...r }) => ({ ...r, requests_today: used.get(id) ?? 0 })),
  };
}
