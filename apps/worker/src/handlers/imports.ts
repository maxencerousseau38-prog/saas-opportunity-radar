// catalog_import and feedback_import handlers (PRD §18; Implementation
// Blueprint §10 imports, §6.5 D4). Rows are validated here (the web app
// never parses CSV); every row is applied idempotently, so a resumed job
// replays rows without duplicating products or reviews.
import { createHash, createHmac } from "node:crypto";
import {
  FeedbackImportRequestSchema,
  FeedbackImportRowSchema,
  ProductImportRowSchema,
} from "@sor/contracts";
import { pipelineRepo, type DbClient, type Json } from "@sor/database";
import { CsvError, parseCsv } from "@sor/data-sources";
import { JobError, classifyExclusion, normalizeUrl, resolveIdentity, slugify } from "@sor/domain";
import type { HandlerContext, HandlerOutcome } from "../runtime";

type RowResult = { row: number; status: string; reasons?: string[]; product_id?: string };
const MAX_REPORTED_ROWS = 1000;

const nullable = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : v.trim());

function summarize(rows: RowResult[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { total: rows.length, counts, rows: rows.slice(0, MAX_REPORTED_ROWS) };
}

function readCsv(payload: unknown, maxRows: number) {
  const csv = (payload as { csv?: unknown }).csv;
  if (typeof csv !== "string")
    throw new JobError("permanent", "VALIDATION_ERROR", "payload without csv");
  try {
    return parseCsv(csv, { maxRows });
  } catch (err) {
    if (err instanceof CsvError)
      throw new JobError("permanent", "VALIDATION_ERROR", `csv: ${err.message}`);
    throw err;
  }
}

export function catalogImportHandler(deps: {
  db: DbClient;
  limits: () => Promise<Record<string, number>>;
}) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const limits = await deps.limits();
    const table = readCsv(ctx.job.payload, limits.import_max_rows ?? 1000);
    const results: RowResult[] = [];
    for (const [index, cells] of table.rows.entries()) {
      if (ctx.cancelRequested()) {
        return { state: "cancelled", terminalReason: "cancelled", result: summarize(results) };
      }
      const rowNumber = index + 2; // header is line 1
      const parsed = ProductImportRowSchema.safeParse({
        name: cells.name ?? "",
        website_url: cells.website_url ?? "",
        company_name: nullable(cells.company_name),
        country_code: nullable(cells.country_code),
        employee_min: cells.employee_min ?? "",
        employee_max: cells.employee_max ?? "",
        category_slugs: (cells.category_slugs ?? "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
        source_url: nullable(cells.source_url),
      });
      if (!parsed.success) {
        results.push({
          row: rowNumber,
          status: "rejected",
          reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        continue;
      }
      const row = parsed.data;
      const url = normalizeUrl(row.website_url);
      const lookup = await pipelineRepo.identityLookups(deps.db, {
        canonicalUrl: url.canonicalUrl,
        registrableDomain: url.registrableDomain,
        name: row.name,
      });
      const decision = resolveIdentity(
        {
          name: row.name,
          officialUrl: row.website_url,
          description: null,
          sourceKey: "user_import",
          externalId: null,
        },
        lookup,
      );
      if (decision.outcome === "needs_review") {
        results.push({
          row: rowNumber,
          status: "needs_review",
          reasons: [decision.reason],
          ...(decision.possibleDuplicateOf ? { product_id: decision.possibleDuplicateOf } : {}),
        });
        continue;
      }
      const exclusion = classifyExclusion({
        primaryCategorySlugs: row.category_slugs.slice(0, 1),
        name: row.name,
        tagline: null,
        primaryUseCase: null,
        secondaryTexts: [],
        featureTexts: [],
      });
      const applied = await pipelineRepo.importProductRow(deps.db, {
        jobId: ctx.job.id,
        rowIndex: index,
        row: {
          name: row.name,
          canonical_url: url.canonicalUrl,
          domain: url.registrableDomain ?? url.host,
          slug_base: slugify(row.name),
          company_name: row.company_name,
          company_slug_base: row.company_name ? slugify(row.company_name) : null,
          country_code: row.country_code,
          employee_min: row.employee_min,
          employee_max: row.employee_max,
          category_slugs: row.category_slugs,
          source_url: row.source_url,
        } as NonNullable<Json>,
        decision:
          decision.outcome === "matched_existing"
            ? { outcome: "matched_existing", product_id: decision.productId, rule: decision.rule }
            : { outcome: "new", company_id: decision.companyId, rule: decision.rule },
        exclusion: {
          status: exclusion.status,
          rule_set_version: exclusion.ruleSetVersion,
          matched_rules: exclusion.matchedRules,
          incidental_mentions: exclusion.incidentalMentions,
        } as unknown as NonNullable<Json>,
      });
      results.push({
        row: rowNumber,
        status:
          applied.status === "created" &&
          applied.exclusion_status &&
          applied.exclusion_status !== "eligible"
            ? `created_${applied.exclusion_status}`
            : applied.status,
        ...(applied.product_id ? { product_id: applied.product_id } : {}),
      });
    }
    const summary = summarize(results);
    const hasProblems = results.some((r) => r.status === "rejected" || r.status === "needs_review");
    return {
      state: hasProblems ? "partial" : "completed",
      terminalReason: hasProblems ? "partial" : "completed",
      result: summary,
    };
  };
}

export function feedbackImportHandler(deps: {
  db: DbClient;
  authorHashSecret: string;
  limits: () => Promise<Record<string, number>>;
}) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const limits = await deps.limits();
    const request = FeedbackImportRequestSchema.safeParse({
      rights_declaration: (ctx.job.payload as { rights_declaration?: unknown }).rights_declaration,
    });
    if (!request.success)
      throw new JobError("permanent", "VALIDATION_ERROR", "invalid rights declaration");
    const rights = request.data.rights_declaration;
    const table = readCsv(ctx.job.payload, limits.import_max_rows ?? 1000);
    const slugs = [
      ...new Set(table.rows.map((r) => (r.product_slug ?? "").trim()).filter(Boolean)),
    ];
    const products = new Map(
      (await pipelineRepo.visibleProductsBySlug(deps.db, slugs)).map((p) => [p.slug, p.id]),
    );
    const storage =
      rights.storage === "full"
        ? "stored_full"
        : rights.storage === "excerpt"
          ? "stored_excerpt"
          : "reference_only";
    const results: RowResult[] = [];
    for (const [index, cells] of table.rows.entries()) {
      if (ctx.cancelRequested())
        return { state: "cancelled", terminalReason: "cancelled", result: summarize(results) };
      const rowNumber = index + 2;
      const parsed = FeedbackImportRowSchema.safeParse({
        product_slug: cells.product_slug ?? "",
        source_url: cells.source_url ?? "",
        source_name: cells.source_name ?? "",
        published_at: nullable(cells.published_at),
        rating: cells.rating ?? "",
        rating_scale_max: cells.rating_scale_max ?? "",
        text: cells.text ?? "",
        author_reference: nullable(cells.author_reference),
        author_company: nullable(cells.author_company),
      });
      if (!parsed.success) {
        results.push({
          row: rowNumber,
          status: "rejected",
          reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        continue;
      }
      const row = parsed.data;
      const productId = products.get(row.product_slug);
      if (!productId) {
        results.push({
          row: rowNumber,
          status: "rejected",
          reasons: ["product_slug: unknown or not visible"],
        });
        continue;
      }
      const normalizedText = row.text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
      const dedup = createHash("sha256").update(`${productId}\n${normalizedText}`).digest("hex");
      const authorHash =
        rights.author_reference_storage_permitted && row.author_reference
          ? createHmac("sha256", deps.authorHashSecret)
              .update(row.author_reference.trim().toLowerCase())
              .digest("hex")
          : null;
      const applied = await pipelineRepo.importFeedbackRow(deps.db, {
        jobId: ctx.job.id,
        productId,
        row: {
          source_url: row.source_url,
          source_name: row.source_name,
          published_at: row.published_at,
          rating: row.rating,
          rating_scale_max: row.rating_scale_max,
          text:
            storage === "stored_full"
              ? row.text
              : storage === "stored_excerpt"
                ? row.text.slice(0, 500)
                : null,
          content_storage_status: storage,
          deduplication_hash: dedup,
          author_reference_hash: authorHash,
          author_company: rights.author_reference_storage_permitted ? row.author_company : null,
          rights_basis: rights.declared_basis,
        } as NonNullable<Json>,
      });
      results.push({ row: rowNumber, status: applied.status, product_id: productId });
    }
    const summary = summarize(results);
    const hasProblems = results.some((r) => r.status === "rejected");
    return {
      state: hasProblems ? "partial" : "completed",
      terminalReason: hasProblems ? "partial" : "completed",
      result: summary,
    };
  };
}
