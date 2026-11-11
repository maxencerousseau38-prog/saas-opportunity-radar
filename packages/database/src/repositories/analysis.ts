// Opportunity analysis repository (server role): what the opportunity_analysis
// worker and the API read and write (Implementation Blueprint §8, §10, M7).
// Writes go through the M7 RPCs; server-only tables are read with the
// service client after the API has checked membership.
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type JsonValue = NonNullable<Json>;
type Tables = Database["public"]["Tables"];
export type AnalysisRow = Tables["opportunity_analyses"]["Row"];

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}
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

// ------------------------------------------------------------------ requests

export async function requestAnalysis(
  service: DbClient,
  args: {
    workspaceId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    analysisType: "opportunity" | "comparison";
    subject: JsonValue;
    request: JsonValue;
  },
) {
  const rows = need(
    await service.rpc("sor_request_analysis", {
      p_workspace_id: args.workspaceId,
      p_requested_by: args.userId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
      p_analysis_type: args.analysisType,
      p_subject: args.subject,
      p_request: args.request,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_request_analysis returned no row");
  return { analysisId: row.analysis_id, jobId: row.job_id, created: row.created };
}

export async function retryAnalysis(
  service: DbClient,
  args: {
    workspaceId: string;
    userId: string;
    analysisId: string;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  const rows = need(
    await service.rpc("sor_retry_analysis", {
      p_workspace_id: args.workspaceId,
      p_actor: args.userId,
      p_analysis_id: args.analysisId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_retry_analysis returned no row");
  return { jobId: row.job_id, created: row.created };
}

export async function deleteAnalysis(
  service: DbClient,
  args: { workspaceId: string; userId: string; analysisId: string; requestId: string },
) {
  check(
    await service.rpc("sor_delete_analysis", {
      p_workspace_id: args.workspaceId,
      p_actor: args.userId,
      p_analysis_id: args.analysisId,
      p_request_id: args.requestId,
    }),
  );
}

// ------------------------------------------------------------------ worker reads

export interface ScopeProductRecord {
  id: string;
  name: string;
  slug: string;
  role: string;
  visible: boolean;
  websiteUrl: string | null;
  companyId: string | null;
  primaryCategorySlugs: string[];
  categoryIds: string[];
}

export async function loadAnalysis(service: DbClient, analysisId: string) {
  const analysis = check(
    await service.from("opportunity_analyses").select("*").eq("id", analysisId).maybeSingle(),
  );
  if (!analysis) return null;
  const rows = need(
    await service
      .from("analysis_subject_products")
      .select(
        "product_id, role, saas_products(name, slug, website_url, company_id, record_status, exclusion_status, product_categories(category_id, is_primary, categories(slug)))",
      )
      .eq("analysis_id", analysisId),
  );
  const scope: ScopeProductRecord[] = rows.map((r) => {
    const p = r.saas_products as unknown as {
      name: string;
      slug: string;
      website_url: string | null;
      company_id: string | null;
      record_status: string;
      exclusion_status: string;
      product_categories: Array<{
        category_id: string;
        is_primary: boolean;
        categories: { slug: string } | null;
      }>;
    } | null;
    return {
      id: r.product_id,
      name: p?.name ?? "",
      slug: p?.slug ?? "",
      role: r.role,
      visible: p?.record_status === "active" && p?.exclusion_status === "eligible",
      websiteUrl: p?.website_url ?? null,
      companyId: p?.company_id ?? null,
      primaryCategorySlugs: (p?.product_categories ?? [])
        .filter((c) => c.is_primary && c.categories)
        .map((c) => c.categories!.slug),
      categoryIds: (p?.product_categories ?? []).map((c) => c.category_id),
    };
  });
  return { analysis, scope };
}

export interface EvidenceRecord {
  evidenceId: string;
  sourceRecordId: string;
  reliabilityLevel: 1 | 2 | 3 | 4;
  verificationStatus: "verified" | "unverified" | "needs_review" | "stale";
  observedAt: string;
  publishedAt: string | null;
  monetizationSignal: string | null;
  inOpenConflict: boolean;
  productId: string | null;
  companyId: string | null;
  categoryId: string | null;
  claimType: string;
  claimText: string;
  evidenceType: string;
  factStatus: string;
  sourceUrl: string | null;
  sourceName: string | null;
}

const EVIDENCE_COLUMNS =
  "id, product_id, company_id, category_id, claim_type, claim_text, evidence_type, fact_status, monetization_signal, reliability_level, verification_status, published_at, observed_at, source_snapshots(source_record_id, source_records(canonical_url, title, sources(name)))";

type EvidenceSelectRow = {
  id: string;
  product_id: string | null;
  company_id: string | null;
  category_id: string | null;
  claim_type: string;
  claim_text: string;
  evidence_type: string;
  fact_status: string;
  monetization_signal: string | null;
  reliability_level: number;
  verification_status: EvidenceRecord["verificationStatus"] | "rejected";
  published_at: string | null;
  observed_at: string;
  source_snapshots: unknown;
};

async function mapEvidence(
  service: DbClient,
  rows: EvidenceSelectRow[],
): Promise<EvidenceRecord[]> {
  const conflicted = new Set<string>();
  for (const ids of chunks(rows.map((r) => r.id))) {
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
  return rows
    .filter((r) => r.verification_status !== "rejected")
    .map((r) => {
      const snap = r.source_snapshots as {
        source_record_id: string;
        source_records: {
          canonical_url: string;
          title: string | null;
          sources: { name: string } | null;
        } | null;
      } | null;
      return {
        evidenceId: r.id,
        sourceRecordId: snap?.source_record_id ?? r.id,
        reliabilityLevel: r.reliability_level as 1 | 2 | 3 | 4,
        verificationStatus: r.verification_status as EvidenceRecord["verificationStatus"],
        observedAt: r.observed_at,
        publishedAt: r.published_at,
        monetizationSignal: r.monetization_signal,
        inOpenConflict: conflicted.has(r.id),
        productId: r.product_id,
        companyId: r.company_id,
        categoryId: r.category_id,
        claimType: r.claim_type,
        claimText: r.claim_text,
        evidenceType: r.evidence_type,
        factStatus: r.fact_status,
        sourceUrl: snap?.source_records?.canonical_url ?? null,
        sourceName: snap?.source_records?.title ?? snap?.source_records?.sources?.name ?? null,
      };
    });
}

/**
 * Candidate evidence of an analysis: the visible scope products, their
 * companies and user-visible categories (company- and category-level claims),
 * and market-level claims (Implementation Blueprint §8.1; the M7 trigger
 * checks the same scope).
 */
export async function candidateEvidence(
  service: DbClient,
  scope: ScopeProductRecord[],
  limit = 3000,
): Promise<EvidenceRecord[]> {
  const visible = scope.filter((p) => p.visible);
  const productIds = visible.map((p) => p.id);
  const companyIds = [...new Set(visible.map((p) => p.companyId).filter((x): x is string => !!x))];
  const categoryIds = [...new Set(visible.flatMap((p) => p.categoryIds))];
  const rows: EvidenceSelectRow[] = [];
  const take = async (
    q: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  ) => rows.push(...((need(await q) as EvidenceSelectRow[]) ?? []));
  for (const part of chunks(productIds))
    await take(
      service
        .from("evidence_items")
        .select(EVIDENCE_COLUMNS)
        .in("product_id", part)
        .neq("verification_status", "rejected")
        .order("observed_at", { ascending: false })
        .limit(limit),
    );
  for (const part of chunks(companyIds))
    await take(
      service
        .from("evidence_items")
        .select(EVIDENCE_COLUMNS)
        .is("product_id", null)
        .in("company_id", part)
        .neq("verification_status", "rejected")
        .limit(limit),
    );
  if (categoryIds.length > 0) {
    const visibleCategories = need(
      await service
        .from("categories")
        .select("id")
        .in("id", categoryIds)
        .eq("is_user_visible", true),
    ).map((c) => c.id);
    for (const part of chunks(visibleCategories))
      await take(
        service
          .from("evidence_items")
          .select(EVIDENCE_COLUMNS)
          .is("product_id", null)
          .is("company_id", null)
          .in("category_id", part)
          .neq("verification_status", "rejected")
          .limit(limit),
      );
  }
  await take(
    service
      .from("evidence_items")
      .select(EVIDENCE_COLUMNS)
      .is("product_id", null)
      .is("company_id", null)
      .is("category_id", null)
      .in("claim_type", ["market_size", "market_trend"])
      .neq("verification_status", "rejected")
      .order("observed_at", { ascending: false })
      .limit(500),
  );
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  return mapEvidence(service, unique);
}

export async function loadEvidenceByIds(
  service: DbClient,
  ids: string[],
): Promise<EvidenceRecord[]> {
  const rows: EvidenceSelectRow[] = [];
  for (const part of chunks(ids))
    rows.push(
      ...(need(
        await service.from("evidence_items").select(EVIDENCE_COLUMNS).in("id", part),
      ) as unknown as EvidenceSelectRow[]),
    );
  return mapEvidence(service, rows);
}

/**
 * A completed pain point run of the workspace that covers the products with
 * the current clustering and extractor versions (§8.4), most recent first.
 */
export async function findCoveringPainRun(
  service: DbClient,
  args: {
    workspaceId: string;
    productIds: string[];
    algorithmVersion: string;
    extractorContract: string;
    extractorPrompt: string;
  },
): Promise<string | null> {
  const runs = need(
    await service
      .from("pain_point_runs")
      .select("id, pain_point_run_products(product_id)")
      .eq("workspace_id", args.workspaceId)
      .in("status", ["completed", "partial"])
      .eq("algorithm_version", args.algorithmVersion)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(20),
  );
  for (const run of runs) {
    const products = new Set(
      (run.pain_point_run_products as unknown as Array<{ product_id: string }>).map(
        (p) => p.product_id,
      ),
    );
    if (!args.productIds.every((id) => products.has(id))) continue;
    const members = need(
      await service
        .from("pain_point_evidence")
        .select(
          "feedback_problems(extractor_contract_version, extractor_prompt_version), pain_point_clusters!inner(run_id)",
        )
        .eq("pain_point_clusters.run_id", run.id)
        .limit(2000),
    );
    const stale = members.some((m) => {
      const p = m.feedback_problems as unknown as {
        extractor_contract_version: string;
        extractor_prompt_version: string;
      } | null;
      return (
        p !== null &&
        (p.extractor_contract_version !== args.extractorContract ||
          p.extractor_prompt_version !== args.extractorPrompt)
      );
    });
    if (!stale) return run.id;
  }
  return null;
}

export interface VoiceClusterRecord {
  clusterId: string;
  name: string;
  problemCategory: string;
  frequencyLabel: string;
  feedbackCount: number;
  affectedProductCount: number;
  distinctAuthorCount: number | null;
  distinctAuthorCountStatus: string;
  distinctCompanyCount: number | null;
  distinctCompanyCountStatus: string;
  productDistribution: Array<{ product_id: string; feedback_count: number }>;
  resolutionBreakdown: Record<string, number>;
  workarounds: string[];
  evidenceIds: string[];
}

/** Clusters of a run touching the products, with their in-scope feedback evidence. */
export async function voiceClusters(service: DbClient, runId: string, productIds: string[]) {
  const clusters = need(
    await service
      .from("pain_point_clusters")
      .select(
        "id, name, problem_category, frequency_label, feedback_count, affected_product_count, distinct_author_count, distinct_author_count_status, distinct_company_count, distinct_company_count_status, product_distribution, resolution_breakdown",
      )
      .eq("run_id", runId)
      .neq("review_status", "rejected")
      .order("feedback_count", { ascending: false })
      .order("id"),
  );
  const scope = new Set(productIds);
  const members = clusters.length
    ? need(
        await service
          .from("pain_point_evidence")
          .select(
            "cluster_id, feedback_problems(product_id, workaround, customer_feedback(evidence_item_id, author_reference_hash))",
          )
          .in(
            "cluster_id",
            clusters.map((c) => c.id),
          )
          .is("removed_at", null),
      )
    : [];
  const authors = new Set<string>();
  let withoutAuthor = 0;
  const feedbackEvidence = new Set<string>();
  const out: VoiceClusterRecord[] = [];
  for (const c of clusters) {
    const own = members
      .filter((m) => m.cluster_id === c.id)
      .map(
        (m) =>
          m.feedback_problems as unknown as {
            product_id: string;
            workaround: string | null;
            customer_feedback: {
              evidence_item_id: string;
              author_reference_hash: string | null;
            } | null;
          } | null,
      )
      .filter((p): p is NonNullable<typeof p> => p !== null && scope.has(p.product_id));
    if (own.length === 0) continue;
    for (const p of own) {
      if (p.customer_feedback) {
        feedbackEvidence.add(p.customer_feedback.evidence_item_id);
        if (p.customer_feedback.author_reference_hash)
          authors.add(p.customer_feedback.author_reference_hash);
        else withoutAuthor++;
      }
    }
    out.push({
      clusterId: c.id,
      name: c.name,
      problemCategory: c.problem_category,
      frequencyLabel: c.frequency_label,
      feedbackCount: c.feedback_count,
      affectedProductCount: c.affected_product_count,
      distinctAuthorCount: c.distinct_author_count,
      distinctAuthorCountStatus: c.distinct_author_count_status,
      distinctCompanyCount: c.distinct_company_count,
      distinctCompanyCountStatus: c.distinct_company_count_status,
      productDistribution: (
        c.product_distribution as Array<{ product_id: string; count?: number }>
      ).map((d) => ({ product_id: d.product_id, feedback_count: d.count ?? 0 })),
      resolutionBreakdown: c.resolution_breakdown as Record<string, number>,
      workarounds: [...new Set(own.map((p) => p.workaround).filter((w): w is string => !!w))].slice(
        0,
        5,
      ),
      evidenceIds: [
        ...new Set(
          own.map((p) => p.customer_feedback?.evidence_item_id).filter((x): x is string => !!x),
        ),
      ],
    });
  }
  return {
    clusters: out,
    relevantSourceCount: feedbackEvidence.size,
    // Distinct authors only when every feedback carries an author reference.
    distinctAuthorCount: withoutAuthor === 0 && feedbackEvidence.size > 0 ? authors.size : null,
  };
}

// ------------------------------------------------------------------ worker writes

export async function addEvidence(
  service: DbClient,
  analysisId: string,
  stepId: string | null,
  ids: string[],
) {
  for (const part of chunks(ids))
    check(
      await service.rpc("sor_analysis_add_evidence", {
        p_analysis_id: analysisId,
        p_step_id: stepId as string,
        p_evidence_ids: part,
      }),
    );
}

export async function finalize(service: DbClient, analysisId: string, result: JsonValue) {
  check(
    await service.rpc("sor_analysis_finalize", { p_analysis_id: analysisId, p_result: result }),
  );
}

export async function markNeedsReview(
  service: DbClient,
  analysisId: string,
  limitations: JsonValue,
) {
  check(
    await service.rpc("sor_analysis_needs_review", {
      p_analysis_id: analysisId,
      p_limitations: limitations,
    }),
  );
}

export async function ensurePainRun(
  service: DbClient,
  analysisId: string,
  maxFeedbackItems: number,
) {
  return need(
    await service.rpc("sor_analysis_pain_run", {
      p_analysis_id: analysisId,
      p_max_feedback_items: maxFeedbackItems,
    }),
  );
}

export async function finishPainRun(
  service: DbClient,
  analysisId: string,
  status: "completed" | "partial",
) {
  check(
    await service.rpc("sor_analysis_finish_pain_run", {
      p_analysis_id: analysisId,
      p_status: status,
    }),
  );
}

export async function saveExport(
  service: DbClient,
  args: {
    jobId: string;
    format: "json" | "markdown";
    filename: string;
    contentType: string;
    content: string;
  },
) {
  return need(
    await service.rpc("sor_save_report_export", {
      p_job_id: args.jobId,
      p_format: args.format,
      p_filename: args.filename,
      p_content_type: args.contentType,
      p_content: args.content,
    }),
  );
}
