// Pain Point Intelligence services (Implementation Blueprint §7, §10 "Pain
// Point Intelligence"). Workspace data is read with the user's client (RLS);
// server-only problems and feedback text go through the service client after
// the workspace check. The server, never the browser, recomputes cluster
// statistics after a correction (@sor/domain P7).
import "server-only";
import {
  SAMPLE_LIMITATIONS,
  type ClusterCorrection,
  type GeneratedOpportunityPatch,
  type PainPointRunRequest,
} from "@sor/contracts";
import { painRepo, type DbClient } from "@sor/database";
import { clusterStatsColumns, computeClusterStatistics, type ClusterMember } from "@sor/domain";
import { ApiError } from "@/lib/api/http";
import { requestHash } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

const RUN_COLUMNS =
  "id, title, scope_type, scope_category_id, status, parameters, feedback_considered, problems_extracted, clusters_created, opportunities_generated, algorithm_version, sources_report, limitations, error_summary, job_execution_id, started_at, completed_at, created_at";
const CLUSTER_COLUMNS =
  "id, run_id, name, description, problem_category, target_persona, severity_score, frequency_label, feedback_count, distinct_author_count, distinct_author_count_status, distinct_company_count, distinct_company_count_status, affected_product_count, product_distribution, resolution_breakdown, existing_solutions, first_detected_at, last_observed_at, confidence_score, review_status, algorithm_version, created_at, updated_at";

function check<T>(res: { data: T; error: { message?: string; code?: string } | null }): T {
  if (res.error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: res.error.code });
  return res.data;
}

/** List queries: no data without an error means an empty list. */
function list<T>(res: {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}): T[] {
  return check(res) ?? [];
}

const runUrl = (ws: string, id: string) => `/api/v1/workspaces/${ws}/pain-point-runs/${id}`;

// ------------------------------------------------------------------ runs
export async function requestRun(args: {
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  body: PainPointRunRequest;
}) {
  const service = getServiceClient();
  let categoryId: string | null = null;
  if (args.body.scope.type === "category") {
    const { data } = await service
      .from("categories")
      .select("id")
      .eq("slug", args.body.scope.category_slug)
      .maybeSingle();
    if (!data) throw new ApiError("NOT_FOUND", "Catégorie introuvable");
    categoryId = data.id;
  }
  const productIds =
    args.body.scope.type === "product"
      ? [args.body.scope.product_id]
      : args.body.scope.type === "product_set"
        ? args.body.scope.product_ids
        : null;
  const res = await painRepo.requestRun(service, {
    workspaceId: args.workspaceId,
    requestedBy: args.userId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("pain_point_run", args.body),
    title: args.body.title,
    scopeType: args.body.scope.type,
    productIds,
    categoryId,
    parameters: { max_feedback_items: args.body.max_feedback_items },
  });
  return Response.json(
    {
      data: {
        id: res.runId,
        job_id: res.jobId,
        status: "queued",
        status_url: `${runUrl(args.workspaceId, res.runId)}/progress`,
        created: res.created,
      },
    },
    { status: 202 },
  );
}

export async function listRuns(client: DbClient, workspaceId: string, cursor: string | null) {
  let q = client
    .from("pain_point_runs")
    .select(RUN_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor) {
    const [at, id] = cursor.split("|");
    if (!at || !id) throw new ApiError("VALIDATION_ERROR", "Curseur invalide");
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const rows = list(await q);
  const page = rows.slice(0, 50);
  const last = page[page.length - 1];
  return {
    data: page,
    next_cursor: rows.length > 50 && last ? `${last.created_at}|${last.id}` : null,
  };
}

export async function getRun(client: DbClient, workspaceId: string, runId: string) {
  const run = check(
    await client
      .from("pain_point_runs")
      .select(RUN_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", runId)
      .maybeSingle(),
  );
  if (!run) throw new ApiError("NOT_FOUND");
  const products = list(
    await client
      .from("pain_point_run_products")
      .select("product_id, total_known_review_count, saas_products(name, slug)")
      .eq("run_id", runId),
  );
  return {
    ...run,
    products: products.map((p) => {
      const sp = p.saas_products as unknown as { name: string; slug: string } | null;
      // A product hidden since the request (excluded, under review) is shown without its name.
      return {
        product_id: p.product_id,
        name: sp?.name ?? null,
        slug: sp?.slug ?? null,
        total_known_review_count: p.total_known_review_count,
      };
    }),
  };
}

const STAGES = [
  "P3_problem_extractor",
  "P4_embedder",
  "P6_cluster_verifier",
  "P7_statistics",
  "P8_gap_identifier",
  "P9_opportunity_generator",
  "P9_persist",
];

export async function runProgress(client: DbClient, workspaceId: string, runId: string) {
  const run = await getRun(client, workspaceId, runId);
  const service = getServiceClient();
  const steps = run.job_execution_id ? await painRepo.runSteps(service, run.job_execution_id) : [];
  const done = steps.filter((s) => s.state === "completed");
  const last = STAGES.filter((k) => done.some((s) => s.agent_key === k)).at(-1) ?? null;
  return {
    id: run.id,
    status: run.status,
    steps_completed: done.length,
    steps_failed: steps.filter((s) => s.state === "failed").length,
    last_completed_agent: last,
    started_at: run.started_at,
    completed_at: run.completed_at,
    error_summary: run.error_summary,
  };
}

async function runJobId(client: DbClient, workspaceId: string, runId: string): Promise<string> {
  const run = await getRun(client, workspaceId, runId);
  if (!run.job_execution_id) throw new ApiError("INVALID_STATE");
  return run.job_execution_id;
}

export async function cancelRun(
  client: DbClient,
  workspaceId: string,
  userId: string,
  runId: string,
) {
  const jobId = await runJobId(client, workspaceId, runId);
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
  const res = await painRepo.retryRun(getServiceClient(), {
    workspaceId: args.workspaceId,
    actor: args.userId,
    runId: args.runId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("pain_point_run_retry", { run_id: args.runId }),
  });
  return Response.json(
    {
      data: {
        id: args.runId,
        job_id: res.jobId,
        status: "queued",
        status_url: `${runUrl(args.workspaceId, args.runId)}/progress`,
        created: res.created,
      },
    },
    { status: 202 },
  );
}

export async function deleteRun(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  runId: string;
  requestId: string;
}) {
  await getRun(args.client, args.workspaceId, args.runId);
  await painRepo.deleteRun(getServiceClient(), {
    workspaceId: args.workspaceId,
    actor: args.userId,
    runId: args.runId,
    requestId: args.requestId,
  });
}

export async function listGaps(client: DbClient, workspaceId: string, runId: string) {
  await getRun(client, workspaceId, runId);
  const gaps = list(
    await client
      .from("market_gaps")
      .select(
        "id, title, gap_type, description, existing_solutions_observed, confidence, created_at, market_gap_clusters(cluster_id), market_gap_evidence(evidence_item_id, support_type)",
      )
      .eq("run_id", runId)
      .order("confidence", { ascending: false }),
  );
  return gaps.map((g) => ({
    id: g.id,
    title: g.title,
    gap_type: g.gap_type,
    description: g.description,
    existing_solutions_observed: g.existing_solutions_observed,
    // An absence of observed solution is never proof of no competition (PRD §7.3.D).
    absence_of_solution_is_verified: false,
    confidence: g.confidence,
    cluster_ids: g.market_gap_clusters.map((c) => c.cluster_id),
    evidence: g.market_gap_evidence.map((e) => ({
      evidence_id: e.evidence_item_id,
      support_type: e.support_type,
    })),
  }));
}

// ------------------------------------------------------------------ clusters
export async function listClusters(client: DbClient, workspaceId: string, runId: string | null) {
  let q = client
    .from("pain_point_clusters")
    .select(CLUSTER_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("feedback_count", { ascending: false })
    .order("id")
    .limit(200);
  if (runId) q = q.eq("run_id", runId);
  return list(await q).map((c) => ({ ...c, sample_limitations: SAMPLE_LIMITATIONS }));
}

export async function getCluster(client: DbClient, workspaceId: string, clusterId: string) {
  const cluster = check(
    await client
      .from("pain_point_clusters")
      .select(CLUSTER_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", clusterId)
      .maybeSingle(),
  );
  if (!cluster) throw new ApiError("NOT_FOUND");
  const ids = (cluster.product_distribution as Array<{ product_id: string }>).map(
    (p) => p.product_id,
  );
  const names =
    ids.length === 0
      ? []
      : list(await client.from("saas_products").select("id, name, slug").in("id", ids));
  // Time evolution: monthly counts of the active, non-duplicate members (Implementation Blueprint §7.3).
  const members = await painRepo.clusterMembers(getServiceClient(), [clusterId]);
  const months = new Map<string, number>();
  for (const m of members) {
    if (m.removedAt || !m.feedback?.published_at || m.feedback.is_near_duplicate_of) continue;
    const month = m.feedback.published_at.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return {
    ...cluster,
    products: (
      cluster.product_distribution as Array<{
        product_id: string;
        count: number;
        relative_frequency: number | null;
      }>
    ).map((p) => {
      const n = names.find((x) => x.id === p.product_id);
      return { ...p, name: n?.name ?? null, slug: n?.slug ?? null };
    }),
    monthly_counts: [...months.entries()].sort().map(([month, count]) => ({ month, count })),
    sample_limitations: SAMPLE_LIMITATIONS,
  };
}

export async function clusterEvidence(client: DbClient, workspaceId: string, clusterId: string) {
  await getCluster(client, workspaceId, clusterId);
  return painRepo.clusterEvidence(getServiceClient(), clusterId);
}

export async function clusterHistory(client: DbClient, workspaceId: string, clusterId: string) {
  await getCluster(client, workspaceId, clusterId);
  return list(
    await client
      .from("pain_point_cluster_snapshots")
      .select(
        "observed_at, feedback_count, affected_product_count, distinct_author_count, distinct_company_count, resolution_breakdown",
      )
      .eq("cluster_id", clusterId)
      .order("observed_at"),
  );
}

export async function correctCluster(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  clusterId: string;
  requestId: string;
  correction: ClusterCorrection;
}) {
  const cluster = await getCluster(args.client, args.workspaceId, args.clusterId);
  const removed = new Set([
    ...args.correction.remove_problem_ids,
    ...(args.correction.move_problem_ids_to_cluster?.problem_ids ?? []),
  ]);
  const changesMembers = removed.size > 0;
  const service = getServiceClient();
  const sourceMembers = changesMembers
    ? await painRepo.clusterMembers(service, [args.clusterId])
    : [];
  const stats = changesMembers
    ? await recomputedStats(
        sourceMembers,
        cluster.run_id,
        (m) => m.removedAt === null && !removed.has(m.problem.id),
      )
    : null;
  let targetStats: Record<string, unknown> | null = null;
  const move = args.correction.move_problem_ids_to_cluster;
  if (move) {
    const target = await getCluster(args.client, args.workspaceId, move.target_cluster_id);
    const moved = new Set(move.problem_ids);
    // The target keeps its active members and gains the moved problems.
    const targetMembers = await painRepo.clusterMembers(service, [target.id]);
    const keep = new Set(
      targetMembers.filter((m) => m.removedAt === null).map((m) => m.problem.id),
    );
    targetStats = await recomputedStats(
      [...targetMembers, ...sourceMembers.filter((m) => moved.has(m.problem.id))],
      target.run_id,
      (m) => keep.has(m.problem.id) || moved.has(m.problem.id),
    );
  }
  return painRepo.correctCluster(getServiceClient(), {
    workspaceId: args.workspaceId,
    actor: args.userId,
    clusterId: args.clusterId,
    requestId: args.requestId,
    expectedUpdatedAt: cluster.updated_at,
    correction: args.correction as never,
    stats: stats as never,
    targetStats: targetStats as never,
  });
}

type Member = Awaited<ReturnType<typeof painRepo.clusterMembers>>[number];

/** Statistics of a membership, computed by the server with @sor/domain P7. */
async function recomputedStats(members: Member[], runId: string, include: (m: Member) => boolean) {
  const seen = new Set<string>();
  const unique = members.filter((m) =>
    seen.has(m.problem.id) ? false : (seen.add(m.problem.id), true),
  );
  const service = getServiceClient();
  const scope = await service
    .from("pain_point_run_products")
    .select("product_id, total_known_review_count")
    .eq("run_id", runId);
  const active: ClusterMember[] = unique
    .filter((m) => include(m) && m.feedback)
    .map((m) => ({
      problemId: m.problem.id,
      feedbackId: m.problem.feedback_id,
      productId: m.problem.product_id,
      authorReferenceHash: m.feedback!.author_reference_hash,
      authorCompanyReference: m.feedback!.author_company_reference,
      publishedAt: m.feedback!.published_at,
      severity: m.problem.severity,
      resolutionStatus: m.problem.resolution_status,
      isDuplicate: m.feedback!.is_near_duplicate_of !== null,
      evidence: {
        sourceRecordId: m.feedback!.source_record_id,
        reliabilityLevel: m.feedback!.reliability_level,
        verificationStatus: m.feedback!.verification_status,
        datedAt: m.feedback!.dated_at,
        inOpenConflict: m.feedback!.in_open_conflict,
      },
    }));
  return clusterStatsColumns(
    computeClusterStatistics(
      active,
      (scope.data ?? []).map((s) => ({
        productId: s.product_id,
        totalKnownReviewCount: s.total_known_review_count,
      })),
      { verifierCoherent: null, now: new Date() },
    ),
  );
}

// ------------------------------------------------------------------ generated opportunities
const OPP_COLUMNS =
  "id, created_from_run_id, name, description, problem_statement, target_persona, proposed_solution, value_proposition, differentiation, business_model_hypothesis, pricing_hypothesis, technical_feasibility_notes, distribution_hypothesis, validation_needed, is_hypothesis, exclusion_status, status, is_favorite, notes, created_at, updated_at";

export async function listOpportunities(client: DbClient, workspaceId: string) {
  return list(
    await client
      .from("generated_opportunities")
      .select(`${OPP_COLUMNS}, generated_opportunity_clusters(cluster_id)`)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
  ).map((o) => ({
    ...o,
    cluster_ids: o.generated_opportunity_clusters.map((c) => c.cluster_id),
    generated_opportunity_clusters: undefined,
  }));
}

export async function getOpportunity(client: DbClient, workspaceId: string, id: string) {
  const o = check(
    await client
      .from("generated_opportunities")
      .select(
        `${OPP_COLUMNS}, generated_opportunity_clusters(cluster_id, pain_point_clusters(name)), generated_opportunity_products(product_id, role, saas_products(name, slug))`,
      )
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!o) throw new ApiError("NOT_FOUND");
  return {
    ...o,
    clusters: o.generated_opportunity_clusters.map((c) => ({
      cluster_id: c.cluster_id,
      name: (c.pain_point_clusters as unknown as { name: string } | null)?.name ?? null,
    })),
    products: o.generated_opportunity_products.map((p) => {
      const sp = p.saas_products as unknown as { name: string; slug: string } | null;
      return {
        product_id: p.product_id,
        role: p.role,
        name: sp?.name ?? null,
        slug: sp?.slug ?? null,
      };
    }),
    generated_opportunity_clusters: undefined,
    generated_opportunity_products: undefined,
  };
}

export async function patchOpportunity(
  client: DbClient,
  workspaceId: string,
  id: string,
  patch: GeneratedOpportunityPatch,
) {
  const row = check(
    await client
      .from("generated_opportunities")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select("id, status, is_favorite, notes, updated_at")
      .maybeSingle(),
  );
  if (!row) throw new ApiError("NOT_FOUND");
  return row;
}
