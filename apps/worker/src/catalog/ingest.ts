// Catalog ingestion (first bulk collection, 10 November 2026). Loads the
// listings of a collected snapshot into the catalog through the existing
// rules: URL normalization, identity resolution (canonical URL, source id,
// domain; never the name alone), the permanent exclusion classifier, the
// deterministic category mapping, and the provenance RPC. Idempotent: an
// ingested listing replayed later creates nothing.
import { createHash } from "node:crypto";
import { CatalogListingSchema, type CatalogListing } from "@sor/contracts";
import { pipelineRepo, type DbClient, type Json } from "@sor/database";
import {
  CATEGORY_MAPPING_VERSION,
  categorizeListing,
  classifyExclusion,
  isSharedHost,
  normalizeUrl,
  resolveIdentity,
  slugify,
} from "@sor/domain";

export type ListingOutcome =
  "created" | "created_hidden" | "matched_existing" | "needs_review" | "rejected" | "error";

export interface IngestSummary {
  source_key: string;
  category_mapping_version: string;
  total: number;
  counts: Record<ListingOutcome, number>;
  /** Why listings were sent to review or rejected (not imported). */
  reasons: Record<string, number>;
  /** Listings sent to review and recorded in the operator queue (S8.2). */
  reviews_recorded: number;
  /** Primary categories of the created products. */
  primary_categories: Record<string, number>;
  uncategorised: number;
  errors: string[];
}

/** Content hash of a listing without its retrieval date (same content, same snapshot). */
export function listingHash(listing: CatalogListing): string {
  const content: Partial<CatalogListing> = { ...listing };
  delete content.retrieved_at;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export async function ingestListings(
  db: DbClient,
  input: unknown[],
  options: { sourceKey: string; log?: (line: string) => void },
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    source_key: options.sourceKey,
    category_mapping_version: CATEGORY_MAPPING_VERSION,
    total: input.length,
    counts: {
      created: 0,
      created_hidden: 0,
      matched_existing: 0,
      needs_review: 0,
      rejected: 0,
      error: 0,
    },
    reasons: {},
    reviews_recorded: 0,
    primary_categories: {},
    uncategorised: 0,
    errors: [],
  };
  const skip = (outcome: "needs_review" | "rejected", reason: string) => {
    summary.counts[outcome]++;
    summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
  };
  const sourceId = await pipelineRepo.sourceIdByKey(db, options.sourceKey);
  if (!sourceId) throw new Error(`unknown source ${options.sourceKey}`);

  for (const [index, raw] of input.entries()) {
    if (options.log && index > 0 && index % 500 === 0) {
      options.log(`${index}/${input.length} listings processed`);
    }
    const parsed = CatalogListingSchema.safeParse(raw);
    if (!parsed.success || parsed.data.source_key !== options.sourceKey) {
      skip("rejected", "invalid_listing");
      continue;
    }
    const listing = parsed.data;
    let url: ReturnType<typeof normalizeUrl>;
    try {
      url = normalizeUrl(listing.website_url);
    } catch {
      skip("rejected", "invalid_website_url");
      continue;
    }
    const categories = categorizeListing({
      name: listing.name,
      description: listing.description,
      sourceCategories: listing.source_categories,
    });
    const exclusion = classifyExclusion({
      primaryCategorySlugs: categories.slice(0, 1),
      name: listing.name,
      tagline: listing.description,
      primaryUseCase: listing.source_categories.join("; ") || null,
      secondaryTexts: [],
      featureTexts: [],
    });
    const row = {
      source_key: listing.source_key,
      external_id: listing.external_id,
      source_url: listing.source_url,
      name: listing.name,
      description: listing.description,
      canonical_url: url.canonicalUrl,
      domain: url.registrableDomain ?? url.host,
      slug_base: slugify(listing.name),
      launch_year: listing.launch_year,
      country_code: listing.country_code,
      company_name: listing.company_name,
      company_external_id: listing.company_external_id,
      company_slug_base: listing.company_name ? slugify(listing.company_name) : null,
      category_slugs: categories,
      source_categories: listing.source_categories,
      licence: listing.licence,
      retrieved_at: listing.retrieved_at,
      content_hash: listingHash(listing),
    } as unknown as NonNullable<Json>;
    const exclusionJson = {
      status: exclusion.status,
      rule_set_version: exclusion.ruleSetVersion,
      matched_rules: exclusion.matchedRules,
      incidental_mentions: exclusion.incidentalMentions,
    } as unknown as NonNullable<Json>;
    // A listing sent to review is kept in the operator queue (S8.2), ready to
    // be created, attached to an existing product or rejected there.
    const review = async (reason: string, candidates: string[]) => {
      skip("needs_review", reason);
      try {
        await pipelineRepo.recordCatalogReview(db, {
          row,
          exclusion: exclusionJson,
          reason,
          candidates: [...new Set(candidates)],
        });
        summary.reviews_recorded++;
      } catch (err) {
        summary.counts.error++;
        if (summary.errors.length < 20)
          summary.errors.push(
            `${listing.external_id}: review not recorded ${(err as Error).message ?? ""}`.slice(
              0,
              300,
            ),
          );
      }
    };
    // An app-store page, a code host or a social profile is not an official product site.
    if (isSharedHost(url.registrableDomain)) {
      await review("shared_host_website", []);
      continue;
    }
    try {
      const lookup = await pipelineRepo.identityLookups(db, {
        canonicalUrl: url.canonicalUrl,
        registrableDomain: url.registrableDomain,
        sourceId,
        externalId: listing.external_id,
        name: listing.name,
      });
      const decision = resolveIdentity(
        {
          name: listing.name,
          officialUrl: listing.website_url,
          description: listing.description,
          sourceKey: listing.source_key,
          externalId: listing.external_id,
        },
        lookup,
      );
      if (decision.outcome === "needs_review") {
        await review(decision.reason, [
          ...(decision.possibleDuplicateOf ? [decision.possibleDuplicateOf] : []),
          ...(decision.reason === "domain_maps_to_several_products" ? lookup.productsByDomain : []),
        ]);
        continue;
      }
      // Same registrable domain but another canonical URL: possibly another
      // product of the same company. A human decides; evidence is never
      // attached to a product on a domain match alone.
      if (decision.outcome === "matched_existing" && decision.rule === "domain") {
        await review("same_domain_other_url", [decision.productId]);
        continue;
      }
      const res = await pipelineRepo.ingestCatalogListing(db, {
        row,
        decision:
          decision.outcome === "matched_existing"
            ? { outcome: "matched_existing", product_id: decision.productId, rule: decision.rule }
            : { outcome: "new", company_id: decision.companyId, rule: decision.rule },
        exclusion: exclusionJson,
      });
      if (res.status === "matched_existing") {
        summary.counts.matched_existing++;
      } else if (res.exclusion_status && res.exclusion_status !== "eligible") {
        summary.counts.created_hidden++;
        summary.reasons[`exclusion_${res.exclusion_status}`] =
          (summary.reasons[`exclusion_${res.exclusion_status}`] ?? 0) + 1;
      } else {
        summary.counts.created++;
        const primary = categories[0];
        if (primary)
          summary.primary_categories[primary] = (summary.primary_categories[primary] ?? 0) + 1;
        else summary.uncategorised++;
      }
    } catch (err) {
      summary.counts.error++;
      if (summary.errors.length < 20) {
        const e = err as { code?: unknown; cause?: { message?: unknown } };
        summary.errors.push(
          `${listing.external_id}: ${String(e.code ?? "error")} ${String(e.cause?.message ?? (err as Error).message ?? "")}`.slice(
            0,
            300,
          ),
        );
      }
    }
  }
  return summary;
}
