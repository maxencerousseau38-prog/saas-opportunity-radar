// Opportunity analysis services (Implementation Blueprint §8, §9.7, §10
// "Opportunity analysis"). Analyses, scores, findings and the evidence index
// are read with the user's client (RLS: members only); catalog evidence and
// exports are read with the service client after the workspace check. The
// browser never writes an analysis result: requests create jobs (202).
import "server-only";
import type { AnalysisRequest } from "@sor/contracts";
import { analysisRepo, type DbClient } from "@sor/database";
import { ApiError } from "@/lib/api/http";
import { createJob, requestHash } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

const ANALYSIS_COLUMNS =
  "id, analysis_type, subject_type, subject_product_id, subject_category_id, subject_cluster_id, subject_generated_opportunity_id, subject_snapshot, analysis_version, scoring_rules_version, analysis_depth, target_market, status, score_total, provisional_points, score_coverage, willingness_to_pay_score, confidence_score, decision_band, verdict, verdict_reasons, executive_summary, limitations, terminal_reason, job_execution_id, started_at, completed_at, created_at";
const LIST_COLUMNS =
  "id, subject_type, subject_snapshot, analysis_depth, status, score_total, provisional_points, score_coverage, willingness_to_pay_score, confidence_score, decision_band, verdict, created_at, completed_at";

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
const analysisUrl = (ws: string, id: string) => `/api/v1/workspaces/${ws}/analyses/${id}`;

/** Name of the subject frozen at request time. */
export function subjectLabel(snapshot: unknown): string {
  const s = (snapshot ?? {}) as Record<string, { name?: string } | Array<{ name: string }>>;
  const named = (k: string) => (s[k] as { name?: string } | undefined)?.name;
  const products = s.products as Array<{ name: string }> | undefined;
  return (
    named("product") ??
    named("category") ??
    named("cluster") ??
    named("generated_opportunity") ??
    (products ? products.map((p) => p.name).join(", ") : "Analyse")
  );
}

// ------------------------------------------------------------------ requests
export async function requestAnalysis(args: {
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  body: AnalysisRequest;
}) {
  if (args.body.analysis_type === "comparison")
    throw new ApiError(
      "VALIDATION_ERROR",
      "Les analyses comparatives arrivent en phase 2 ; utilisez la comparaison simple (Compare).",
    );
  const res = await analysisRepo.requestAnalysis(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("opportunity_analysis", args.body),
    analysisType: args.body.analysis_type,
    subject: args.body.subject as never,
    request: {
      analysis_depth: args.body.analysis_depth,
      context: args.body.context,
      options: args.body.options,
    } as never,
  });
  return Response.json(
    {
      data: {
        id: res.analysisId,
        job_id: res.jobId,
        status: "queued",
        status_url: `${analysisUrl(args.workspaceId, res.analysisId)}/progress`,
        created: res.created,
      },
    },
    { status: 202 },
  );
}

export async function listAnalyses(
  client: DbClient,
  workspaceId: string,
  query: {
    cursor?: string | undefined;
    limit: number;
    subject_type?: string | undefined;
    product_id?: string | undefined;
    cluster_id?: string | undefined;
    generated_opportunity_id?: string | undefined;
  },
) {
  let q = client
    .from("opportunity_analyses")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);
  if (query.subject_type) q = q.eq("subject_type", query.subject_type as never);
  if (query.product_id) q = q.eq("subject_product_id", query.product_id);
  if (query.cluster_id) q = q.eq("subject_cluster_id", query.cluster_id);
  if (query.generated_opportunity_id)
    q = q.eq("subject_generated_opportunity_id", query.generated_opportunity_id);
  if (query.cursor) {
    const [at, id] = query.cursor.split("|");
    if (!at || !id) throw new ApiError("VALIDATION_ERROR", "Curseur invalide");
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const rows = list(await q);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({ ...r, subject_label: subjectLabel(r.subject_snapshot) })),
    next_cursor: rows.length > query.limit && last ? `${last.created_at}|${last.id}` : null,
  };
}

export async function getAnalysis(client: DbClient, workspaceId: string, analysisId: string) {
  const a = check(
    await client
      .from("opportunity_analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", analysisId)
      .maybeSingle(),
  );
  if (!a) throw new ApiError("NOT_FOUND");
  const scope = list(
    await client
      .from("analysis_subject_products")
      .select("product_id, role, saas_products(name, slug)")
      .eq("analysis_id", analysisId),
  );
  return {
    ...a,
    subject_label: subjectLabel(a.subject_snapshot),
    scope: scope.map((p) => {
      const sp = p.saas_products as unknown as { name: string; slug: string } | null;
      // A product hidden since the request is shown without its name.
      return {
        product_id: p.product_id,
        role: p.role,
        name: sp?.name ?? null,
        slug: sp?.slug ?? null,
      };
    }),
  };
}

const STAGES: Array<[string, string]> = [
  ["O0_evidence_index", "building_evidence_index"],
  ["O1_product_analyst", "product_research"],
  ["O2_market_analyst", "market_research"],
  ["P3_problem_extractor", "customer_voice"],
  ["O3_customer_voice_analyst", "customer_voice"],
  ["O4_competitor_analyst", "competitor_research"],
  ["O5_localization_analyst", "localization"],
  ["O6_wtp_feasibility_analyst", "feasibility_wtp"],
  ["O7_dimension_assessor", "dimension_assessment"],
  ["O8_red_team_verifier", "red_team"],
  ["O9_report_composer", "report"],
];

export async function analysisProgress(client: DbClient, workspaceId: string, analysisId: string) {
  const a = await getAnalysis(client, workspaceId, analysisId);
  const steps = a.job_execution_id
    ? list(
        await getServiceClient()
          .from("agent_step_runs")
          .select("agent_key, state")
          .eq("job_execution_id", a.job_execution_id),
      )
    : [];
  const done = steps.filter((s) => s.state === "completed");
  const last = STAGES.filter(([k]) => done.some((s) => s.agent_key === k)).at(-1)?.[1] ?? null;
  return {
    id: a.id,
    status: a.status,
    steps_completed: done.length,
    steps_failed: steps.filter((s) => s.state === "failed").length,
    last_completed_stage: last,
    started_at: a.started_at,
    completed_at: a.completed_at,
  };
}

/** Report: stored report document, dimension rows and findings with their evidence. */
export async function analysisReport(client: DbClient, workspaceId: string, analysisId: string) {
  const a = await getAnalysis(client, workspaceId, analysisId);
  const full = check(
    await client.from("opportunity_analyses").select("report_json").eq("id", analysisId).single(),
  );
  const dimensions = list(
    await client
      .from("analysis_dimension_scores")
      .select(
        "dimension_key, weight, assessment_status, rating, weighted_points, explanation, missing_information, dimension_score_evidence(evidence_item_id, support_type)",
      )
      .eq("analysis_id", analysisId),
  );
  const findings = list(
    await client
      .from("analysis_findings")
      .select(
        "id, finding_type, title, description, priority, confidence, is_hypothesis, severity, is_substantiated, dimension_key, source_agent, finding_evidence(evidence_item_id, support_type)",
      )
      .eq("analysis_id", analysisId)
      .order("priority"),
  );
  return { analysis: a, report: full?.report_json ?? null, dimensions, findings };
}

/** Evidence index of an analysis (scope-checked by the database when written). */
export async function analysisEvidence(client: DbClient, workspaceId: string, analysisId: string) {
  await getAnalysis(client, workspaceId, analysisId);
  const ids = list(
    await client.from("analysis_evidence").select("evidence_item_id").eq("analysis_id", analysisId),
  ).map((r) => r.evidence_item_id);
  const items = await analysisRepo.loadEvidenceByIds(getServiceClient(), ids);
  return items.map((e) => ({
    evidence_id: e.evidenceId,
    product_id: e.productId,
    claim_type: e.claimType,
    claim_text: e.claimText,
    evidence_type: e.evidenceType,
    fact_status: e.factStatus,
    reliability_level: e.reliabilityLevel,
    verification_status: e.verificationStatus,
    monetization_signal: e.monetizationSignal,
    in_open_conflict: e.inOpenConflict,
    published_at: e.publishedAt,
    observed_at: e.observedAt,
    source_url: e.sourceUrl,
    source_name: e.sourceName,
  }));
}

async function jobOf(client: DbClient, workspaceId: string, analysisId: string) {
  const a = await getAnalysis(client, workspaceId, analysisId);
  if (!a.job_execution_id) throw new ApiError("INVALID_STATE");
  return a.job_execution_id;
}

export async function cancelAnalysis(
  client: DbClient,
  workspaceId: string,
  userId: string,
  analysisId: string,
) {
  const jobId = await jobOf(client, workspaceId, analysisId);
  const state = check(
    await getServiceClient().rpc("sor_cancel_job", {
      p_job_id: jobId,
      p_workspace_id: workspaceId,
      p_actor: userId,
    }),
  );
  return { data: { id: analysisId, job_state: state } };
}

export async function retryAnalysis(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  analysisId: string;
  idempotencyKey: string;
}) {
  await getAnalysis(args.client, args.workspaceId, args.analysisId);
  const res = await analysisRepo.retryAnalysis(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    analysisId: args.analysisId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash("opportunity_analysis_retry", { analysis_id: args.analysisId }),
  });
  return Response.json(
    {
      data: {
        id: args.analysisId,
        job_id: res.jobId,
        status: "queued",
        status_url: `${analysisUrl(args.workspaceId, args.analysisId)}/progress`,
        created: res.created,
      },
    },
    { status: 202 },
  );
}

export async function deleteAnalysis(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  analysisId: string;
  requestId: string;
}) {
  await getAnalysis(args.client, args.workspaceId, args.analysisId);
  await analysisRepo.deleteAnalysis(getServiceClient(), {
    workspaceId: args.workspaceId,
    userId: args.userId,
    analysisId: args.analysisId,
    requestId: args.requestId,
  });
}

// ------------------------------------------------------------------ exports
export async function requestExport(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  analysisId: string;
  idempotencyKey: string;
  format: "json" | "markdown";
}) {
  await getAnalysis(args.client, args.workspaceId, args.analysisId);
  return createJob({
    kind: "report_export",
    workspaceId: args.workspaceId,
    userId: args.userId,
    idempotencyKey: args.idempotencyKey,
    payload: { analysis_id: args.analysisId, format: args.format },
  });
}

export async function listExports(client: DbClient, workspaceId: string, analysisId: string) {
  await getAnalysis(client, workspaceId, analysisId);
  return list(
    await getServiceClient()
      .from("report_exports")
      .select("id, format, filename, created_at")
      .eq("workspace_id", workspaceId)
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(20),
  );
}

/** Download of one export (server-only table; membership checked by the route). */
export async function downloadExport(
  client: DbClient,
  workspaceId: string,
  analysisId: string,
  exportId: string,
) {
  await getAnalysis(client, workspaceId, analysisId);
  const row = check(
    await getServiceClient()
      .from("report_exports")
      .select("filename, content_type, content")
      .eq("workspace_id", workspaceId)
      .eq("analysis_id", analysisId)
      .eq("id", exportId)
      .maybeSingle(),
  );
  if (!row) throw new ApiError("NOT_FOUND");
  return new Response(row.content, {
    status: 200,
    headers: {
      "content-type": row.content_type,
      "content-disposition": `attachment; filename="${row.filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Usual criteria of the workspace, prefilled in the analysis form (PRD §7.2, §14.1). */
export async function analysisDefaults(client: DbClient, workspaceId: string) {
  const { data } = await client
    .from("workspace_settings")
    .select("research_preferences")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const prefs = (data?.research_preferences ?? {}) as { adaptation_market?: string };
  return {
    targetCountry: /^[A-Z]{2}$/.test(prefs.adaptation_market ?? "")
      ? prefs.adaptation_market!
      : "FR",
  };
}
