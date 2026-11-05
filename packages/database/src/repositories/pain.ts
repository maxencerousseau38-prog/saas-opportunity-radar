// Pain Point Intelligence repository (server role): what the pain_point_run
// worker reads and writes (Implementation Blueprint §7, M6). Writes go
// through the M6 RPCs; server-only tables are read with the service client.
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type JsonValue = NonNullable<Json>;
type Tables = Database["public"]["Tables"];
export type PainRunRow = Tables["pain_point_runs"]["Row"];
export type FeedbackProblemRow = Tables["feedback_problems"]["Row"];

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}

/** Like `check`, for results that cannot be empty without an error (lists, counts). */
function need<T>(res: {
  data: T;
  error: { code?: string; message?: string } | null;
}): NonNullable<T> {
  const data = check(res);
  if (data === null || data === undefined) throw new Error("empty database result");
  return data as NonNullable<T>;
}

const CHUNK = 200;
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

export async function loadRun(service: DbClient, runId: string) {
  const run = check(
    await service.from("pain_point_runs").select("*").eq("id", runId).maybeSingle(),
  );
  if (!run) return null;
  const products = need(
    await service
      .from("pain_point_run_products")
      .select(
        "product_id, total_known_review_count, saas_products(name, record_status, exclusion_status)",
      )
      .eq("run_id", runId),
  );
  return {
    run,
    products: products.map((p) => {
      const sp = p.saas_products as unknown as {
        name: string;
        record_status: string;
        exclusion_status: string;
      } | null;
      return {
        id: p.product_id,
        name: sp?.name ?? "",
        visible: sp?.record_status === "active" && sp?.exclusion_status === "eligible",
        totalKnownReviewCount: p.total_known_review_count,
      };
    }),
  };
}

export interface FeedbackRecord {
  id: string;
  product_id: string;
  text: string | null;
  published_at: string | null;
  author_reference_hash: string | null;
  author_company_reference: string | null;
  is_near_duplicate_of: string | null;
  evidence_id: string;
  source_record_id: string;
  reliability_level: 1 | 2 | 3 | 4;
  verification_status: "verified" | "unverified" | "needs_review" | "stale" | "rejected";
  dated_at: string | null;
  in_open_conflict: boolean;
}

const FEEDBACK_COLUMNS =
  "id, product_id, original_text, summarized_text, published_at, created_at, author_reference_hash, author_company_reference, is_near_duplicate_of, evidence_item_id, evidence_items(reliability_level, verification_status, published_at, observed_at, source_snapshots(source_record_id))";

type FeedbackSelectRow = {
  id: string;
  product_id: string;
  original_text: string | null;
  summarized_text: string | null;
  published_at: string | null;
  created_at: string;
  author_reference_hash: string | null;
  author_company_reference: string | null;
  is_near_duplicate_of: string | null;
  evidence_item_id: string;
  evidence_items: unknown;
};

async function mapFeedback(
  service: DbClient,
  rows: FeedbackSelectRow[],
): Promise<FeedbackRecord[]> {
  const conflicted = new Set<string>();
  for (const ids of chunks(rows.map((r) => r.evidence_item_id))) {
    for (const column of ["evidence_a_id", "evidence_b_id"] as const) {
      const hits = need(
        await service
          .from("evidence_conflicts")
          .select(column)
          .eq("status", "open")
          .in(column, ids),
      ) as Array<Record<string, string>>;
      for (const h of hits) conflicted.add(h[column] as string);
    }
  }
  return rows.map((r) => {
    const ev = r.evidence_items as {
      reliability_level: number;
      verification_status: FeedbackRecord["verification_status"];
      published_at: string | null;
      observed_at: string;
      source_snapshots: { source_record_id: string } | null;
    } | null;
    return {
      id: r.id,
      product_id: r.product_id,
      text: r.original_text ?? r.summarized_text ?? null,
      published_at: r.published_at,
      author_reference_hash: r.author_reference_hash,
      author_company_reference: r.author_company_reference,
      is_near_duplicate_of: r.is_near_duplicate_of,
      evidence_id: r.evidence_item_id,
      source_record_id: ev?.source_snapshots?.source_record_id ?? r.evidence_item_id,
      reliability_level: (ev?.reliability_level ?? 4) as FeedbackRecord["reliability_level"],
      verification_status: ev?.verification_status ?? "unverified",
      dated_at: ev?.published_at ?? r.published_at ?? ev?.observed_at ?? r.created_at,
      in_open_conflict: conflicted.has(r.evidence_item_id),
    };
  });
}

/** P1: stored feedback of the products, most recent first. */
export async function loadFeedback(
  service: DbClient,
  productIds: string[],
  limit: number,
): Promise<FeedbackRecord[]> {
  if (productIds.length === 0) return [];
  const rows = need(
    await service
      .from("customer_feedback")
      .select(FEEDBACK_COLUMNS)
      .in("product_id", productIds)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(limit),
  ) as unknown as FeedbackSelectRow[];
  return mapFeedback(service, rows);
}

export async function loadFeedbackByIds(
  service: DbClient,
  ids: string[],
): Promise<FeedbackRecord[]> {
  const rows: FeedbackSelectRow[] = [];
  for (const part of chunks(ids))
    rows.push(
      ...(need(
        await service.from("customer_feedback").select(FEEDBACK_COLUMNS).in("id", part),
      ) as unknown as FeedbackSelectRow[]),
    );
  return mapFeedback(service, rows);
}

export async function markDuplicates(
  service: DbClient,
  pairs: Array<{ feedback_id: string; duplicate_of: string }>,
): Promise<number> {
  return need(
    await service.rpc("sor_pain_mark_duplicates", { p_pairs: pairs as unknown as JsonValue }),
  );
}

/**
 * Problems of a feedback item for an extractor version; `[]` when a completed
 * P3 step found none; `null` when it was never extracted with that version.
 */
export async function existingProblems(
  service: DbClient,
  feedbackId: string,
  contractVersion: string,
  promptVersion: string,
  agentKey: string,
): Promise<FeedbackProblemRow[] | null> {
  const rows = need(
    await service
      .from("feedback_problems")
      .select("*")
      .eq("feedback_id", feedbackId)
      .eq("extractor_contract_version", contractVersion)
      .eq("extractor_prompt_version", promptVersion)
      .order("is_primary", { ascending: false })
      .order("created_at")
      .order("id"),
  );
  if (rows.length > 0) return rows;
  const step = need(
    await service
      .from("agent_step_runs")
      .select("id")
      .eq("agent_key", agentKey)
      .eq("step_key", `extract:${feedbackId}`)
      .eq("contract_version", contractVersion)
      .eq("prompt_version", promptVersion)
      .eq("state", "completed")
      .limit(1),
  );
  return step.length > 0 ? [] : null;
}

export async function saveProblems(
  service: DbClient,
  args: {
    feedbackId: string;
    stepId: string | null;
    contractVersion: string;
    promptVersion: string;
    problems: JsonValue;
  },
): Promise<FeedbackProblemRow[]> {
  const ids = need(
    await service.rpc("sor_pain_save_problems", {
      p_feedback_id: args.feedbackId,
      p_step_id: args.stepId as string,
      p_contract_version: args.contractVersion,
      p_prompt_version: args.promptVersion,
      p_problems: args.problems,
    }),
  ) as unknown as string[];
  if (ids.length === 0) return [];
  return need(
    await service
      .from("feedback_problems")
      .select("*")
      .in("id", ids)
      .order("is_primary", { ascending: false })
      .order("created_at")
      .order("id"),
  );
}

export async function loadEmbeddings(
  service: DbClient,
  problemIds: string[],
  model: string,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const ids of chunks(problemIds)) {
    const rows = need(
      await service
        .from("feedback_problem_embeddings")
        .select("problem_id, embedding")
        .eq("embedding_model", model)
        .in("problem_id", ids),
    );
    for (const r of rows) out.set(r.problem_id, JSON.parse(String(r.embedding)) as number[]);
  }
  return out;
}

export async function saveEmbeddings(
  service: DbClient,
  rows: Array<{ problem_id: string; model: string; vector: number[] }>,
): Promise<number> {
  return need(
    await service.rpc("sor_pain_save_embeddings", {
      p_rows: rows.map((r) => ({
        problem_id: r.problem_id,
        model: r.model,
        dimensions: r.vector.length,
        embedding: `[${r.vector.join(",")}]`,
      })) as unknown as JsonValue,
    }),
  );
}

export async function saveClusters(
  service: DbClient,
  runId: string,
  clusters: JsonValue,
): Promise<number> {
  return need(
    await service.rpc("sor_pain_save_clusters", { p_run_id: runId, p_clusters: clusters }),
  );
}

export async function saveInsights(
  service: DbClient,
  runId: string,
  gaps: JsonValue,
  opportunities: JsonValue,
): Promise<JsonValue> {
  return need(
    await service.rpc("sor_pain_save_insights", {
      p_run_id: runId,
      p_gaps: gaps,
      p_opportunities: opportunities,
    }),
  ) as JsonValue;
}

export async function updateRun(
  service: DbClient,
  runId: string,
  patch: Partial<
    Pick<
      PainRunRow,
      | "feedback_considered"
      | "problems_extracted"
      | "clusters_created"
      | "opportunities_generated"
      | "algorithm_version"
      | "sources_report"
      | "limitations"
    >
  >,
): Promise<void> {
  check(await service.from("pain_point_runs").update(patch).eq("id", runId));
}

// ---------------------------------------------------------------------------
// User actions (service role; the RPCs check the actor's workspace role).

export async function requestRun(
  service: DbClient,
  args: {
    workspaceId: string;
    requestedBy: string;
    idempotencyKey: string;
    requestHash: string;
    title: string;
    scopeType: Database["public"]["Enums"]["pain_scope_type"];
    productIds: string[] | null;
    categoryId: string | null;
    parameters: JsonValue;
  },
): Promise<{ runId: string; jobId: string; created: boolean }> {
  const rows = need(
    await service.rpc("sor_request_pain_point_run", {
      p_workspace_id: args.workspaceId,
      p_requested_by: args.requestedBy,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
      p_title: args.title,
      p_scope_type: args.scopeType,
      p_product_ids: args.productIds as string[],
      p_category_id: args.categoryId as string,
      p_parameters: args.parameters,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_request_pain_point_run returned no row");
  return { runId: row.run_id, jobId: row.job_id, created: row.created };
}

export async function retryRun(
  service: DbClient,
  args: {
    workspaceId: string;
    actor: string;
    runId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<{ jobId: string; created: boolean }> {
  const rows = need(
    await service.rpc("sor_retry_pain_point_run", {
      p_workspace_id: args.workspaceId,
      p_actor: args.actor,
      p_run_id: args.runId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_retry_pain_point_run returned no row");
  return { jobId: row.job_id, created: row.created };
}

export async function deleteRun(
  service: DbClient,
  args: { workspaceId: string; actor: string; runId: string; requestId: string },
): Promise<void> {
  check(
    await service.rpc("sor_delete_pain_point_run", {
      p_workspace_id: args.workspaceId,
      p_actor: args.actor,
      p_run_id: args.runId,
      p_request_id: args.requestId,
    }),
  );
}

export async function correctCluster(
  service: DbClient,
  args: {
    workspaceId: string;
    actor: string;
    clusterId: string;
    requestId: string;
    expectedUpdatedAt: string | null;
    correction: JsonValue;
    stats: JsonValue | null;
    targetStats: JsonValue | null;
  },
): Promise<{ cluster_id: string; updated_at: string; review_status: string }> {
  return need(
    await service.rpc("sor_cluster_correction", {
      p_workspace_id: args.workspaceId,
      p_actor: args.actor,
      p_cluster_id: args.clusterId,
      p_request_id: args.requestId,
      p_expected_updated_at: args.expectedUpdatedAt as string,
      p_correction: args.correction,
      p_stats: args.stats as JsonValue,
      p_target_stats: args.targetStats as JsonValue,
    }),
  ) as unknown as { cluster_id: string; updated_at: string; review_status: string };
}

/** Members of clusters with what P7 needs (server-only problems and feedback). */
export async function clusterMembers(service: DbClient, clusterIds: string[]) {
  if (clusterIds.length === 0) return [];
  const rows = need(
    await service
      .from("pain_point_evidence")
      .select(
        "cluster_id, feedback_problem_id, removed_at, membership_source, feedback_problems(id, feedback_id, product_id, severity, resolution_status, problem_statement, problem_category)",
      )
      .in("cluster_id", clusterIds),
  );
  const feedbackIds = [
    ...new Set(
      rows
        .map((r) => (r.feedback_problems as unknown as { feedback_id: string } | null)?.feedback_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const feedback = new Map((await loadFeedbackByIds(service, feedbackIds)).map((f) => [f.id, f]));
  return rows.map((r) => {
    const p = r.feedback_problems as unknown as {
      id: string;
      feedback_id: string;
      product_id: string;
      severity: number | null;
      resolution_status: "resolved" | "unresolved" | "unknown";
      problem_statement: string;
      problem_category: string;
    };
    return {
      clusterId: r.cluster_id,
      removedAt: r.removed_at,
      membershipSource: r.membership_source,
      problem: p,
      feedback: feedback.get(p.feedback_id) ?? null,
    };
  });
}

/**
 * Evidence of a cluster (PRD §12.12; Implementation Blueprint "GET W/clusters/{id}/evidence"):
 * problem → feedback → snapshot → source record. Text only when storage was permitted.
 */
export async function clusterEvidence(service: DbClient, clusterId: string) {
  const rows = need(
    await service
      .from("pain_point_evidence")
      .select(
        "feedback_problem_id, removed_at, membership_source, membership_confidence, feedback_problems(problem_statement, problem_category, severity, resolution_status, switching_intent, workaround, desired_solution, customer_feedback(id, product_id, published_at, rating, rating_scale_max, original_text, summarized_text, content_storage_status, evidence_item_id, source_snapshots(retrieved_at, source_records(id, canonical_url, title, sources(source_key, name)))))",
      )
      .eq("cluster_id", clusterId)
      .order("created_at"),
  );
  return rows.map((r) => {
    const p = r.feedback_problems as unknown as {
      problem_statement: string;
      problem_category: string;
      severity: number | null;
      resolution_status: string;
      switching_intent: string;
      workaround: string | null;
      desired_solution: string | null;
      customer_feedback: {
        id: string;
        product_id: string;
        published_at: string | null;
        rating: number | null;
        rating_scale_max: number | null;
        original_text: string | null;
        summarized_text: string | null;
        content_storage_status: string;
        evidence_item_id: string;
        source_snapshots: {
          retrieved_at: string | null;
          source_records: {
            id: string;
            canonical_url: string;
            title: string | null;
            sources: { source_key: string; name: string } | null;
          } | null;
        } | null;
      } | null;
    } | null;
    const f = p?.customer_feedback ?? null;
    const record = f?.source_snapshots?.source_records ?? null;
    return {
      problem_id: r.feedback_problem_id,
      removed: r.removed_at !== null,
      membership_source: r.membership_source,
      problem_statement: p?.problem_statement ?? "",
      problem_category: p?.problem_category ?? "other",
      severity: p?.severity ?? null,
      resolution_status: p?.resolution_status ?? "unknown",
      switching_intent: p?.switching_intent ?? "unknown",
      workaround: p?.workaround ?? null,
      desired_solution: p?.desired_solution ?? null,
      feedback_id: f?.id ?? null,
      product_id: f?.product_id ?? null,
      published_at: f?.published_at ?? null,
      rating: f?.rating ?? null,
      rating_scale_max: f?.rating_scale_max ?? null,
      excerpt: f?.original_text ?? f?.summarized_text ?? null,
      content_storage_status: f?.content_storage_status ?? "reference_only",
      evidence_id: f?.evidence_item_id ?? null,
      source_id: record?.id ?? null,
      source_name: record?.sources?.name ?? record?.title ?? null,
      evidence_url: record?.canonical_url ?? null,
      retrieved_at: f?.source_snapshots?.retrieved_at ?? null,
    };
  });
}

/** Progress of a run: its job and the agent steps completed so far (server-only steps). */
export async function runSteps(service: DbClient, jobId: string) {
  return need(
    await service.from("agent_step_runs").select("agent_key, state").eq("job_execution_id", jobId),
  );
}
