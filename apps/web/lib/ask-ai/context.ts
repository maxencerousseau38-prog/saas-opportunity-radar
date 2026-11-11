import "server-only";
import { CatalogQuerySchema, type ExternalResearchSection } from "@sor/contracts";
import { catalogRepo, type DbClient } from "@sor/database";
import { ApiError } from "@/lib/api/http";
import { buildGeneral, countProducts, searchProducts } from "@/lib/services/catalog";
import { clusterEvidence, getCluster } from "@/lib/services/pain-points";
import type {
  ExternalResearchClusterContext,
  ExternalResearchContext,
  ExternalResearchCoverage,
  ExternalResearchProductOverview,
  ExternalResearchEvidence,
} from "./types";

// v2 (S8.4): coverage block, category and Pain Point Cluster subjects,
// automatic reductions. Sessions saved in v1 stay readable.
export const EXTERNAL_CONTEXT_VERSION = "sor-context.v2";
export const EXTERNAL_PROMPT_VERSION = "sor-prompt.v2";
/** Products sampled from a category (deterministic: most recently added). */
export const CATEGORY_SAMPLE_SIZE = 5;
/** Cluster problems transmitted at most (most severe first, then most recent). */
export const CLUSTER_MEMBER_LIMIT = 30;

type Product = NonNullable<Awaited<ReturnType<typeof catalogRepo.getProductById>>>;
type Provenance = Awaited<ReturnType<typeof catalogRepo.listProvenance>>[number];

function fact(value: {
  value: unknown;
  fact_status: string;
  verified_at: string | null;
  evidence_ids: string[];
}) {
  return {
    value: value.value,
    status: value.fact_status,
    verified_at: value.verified_at,
    evidence_ids: value.evidence_ids,
  };
}

function short(value: string | null, max = 500) {
  if (!value) return null;
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function collectEvidenceIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIds(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "evidence_id" && typeof item === "string") into.add(item);
      else if (key === "evidence_ids" && Array.isArray(item)) {
        for (const id of item) if (typeof id === "string") into.add(id);
      } else collectEvidenceIds(item, into);
    }
  }
  return into;
}

function baseProduct(product: Product, provenance: Provenance[]): ExternalResearchProductOverview {
  const g = buildGeneral(product, provenance);
  const company = g.company;
  return {
    id: product.id,
    slug: product.slug,
    name: fact(g.name),
    official_website: fact(g.website_url),
    tagline: fact(g.tagline),
    short_description: fact(g.short_description),
    description: fact(g.description),
    problem_solved: fact(g.problem_solved),
    value_proposition: fact(g.value_proposition),
    categories: g.categories,
    customer_type: fact(g.customer_type),
    pricing_status: fact(g.pricing_status),
    billing_models: fact(g.billing_models),
    launch_year: fact(g.launch_year),
    company: company
      ? {
          name: fact(company.name),
          country: fact(company.country_code),
          city: fact(company.city),
          founded_year: fact(company.founded_year),
          employee_min: fact(company.employee_min),
          employee_max: fact(company.employee_max),
          company_type: fact(company.company_type),
          founder_led: fact(company.founder_led),
          funding_status: fact(company.funding_status),
        }
      : null,
  };
}

async function productContext(client: DbClient, product: Product) {
  const [provenance, features, integrations, pricing, feedback, evidence, competitorLinks] =
    await Promise.all([
      catalogRepo.listProvenance(client, product.id, product.company_id),
      catalogRepo.listFeatures(client, product.id),
      catalogRepo.listIntegrations(client, product.id),
      catalogRepo.listPricing(client, [product.id]),
      catalogRepo.listFeedback(client, product.id, 12),
      catalogRepo.listEvidence(client, product.id, product.company_id),
      catalogRepo.listCompetitors(client, product.id),
    ]);

  const summary = baseProduct(product, provenance);
  const feedbackRows = feedback.map((row) => ({
    published_at: row.published_at,
    rating: row.rating,
    rating_scale_max: row.rating_scale_max,
    summary: short(row.summarized_text),
    language: row.language,
    sentiment: row.sentiment,
    source: {
      name: row.source_snapshots?.source_records?.sources?.name ?? null,
      url: row.source_snapshots?.source_records?.canonical_url ?? null,
    },
    evidence_id: row.evidence_item_id,
    limitation: "Échantillon disponible, non représentatif par défaut.",
  }));

  const competitors = competitorLinks
    .filter((row) => row.competitor)
    .slice(0, 8)
    .map((row) => {
      const competitor = row.competitor as unknown as Product;
      return {
        id: competitor.id,
        name: competitor.name,
        website_url: competitor.website_url,
        relationship: row.relationship_type,
        relationship_evidence_id: row.evidence_id,
        explanation: short(row.explanation, 300),
        categories: (competitor.product_categories ?? [])
          .flatMap((item) => (item.categories ? [item.categories.name] : []))
          .slice(0, 5),
      };
    });

  const sourceItems: ExternalResearchEvidence[] = evidence.slice(0, 20).map((row) => ({
    evidence_id: row.id,
    claim_type: row.claim_type,
    claim: short(row.claim_text, 280),
    fact_status: row.fact_status,
    verification_status: row.verification_status,
    reliability_level: row.reliability_level,
    published_at: row.published_at,
    observed_at: row.observed_at,
    source: {
      name: row.source_snapshots?.source_records?.sources?.name ?? null,
      title: row.source_snapshots?.source_records?.title ?? null,
      url: row.source_snapshots?.source_records?.canonical_url ?? null,
      retrieved_at: row.source_snapshots?.retrieved_at ?? null,
    },
  }));

  return {
    overview: summary,
    features: {
      items: features.slice(0, 16).map((row) => ({
        name: row.name,
        description: short(row.description, 280),
        category: row.feature_category,
        primary: row.is_primary,
        availability: row.availability,
        last_verified_at: row.last_verified_at,
        evidence_id: row.evidence_id,
      })),
      integrations: integrations.slice(0, 16).map((row) => ({
        name: row.name,
        category: row.integration_category,
        availability: row.availability,
        evidence_id: row.evidence_id,
      })),
    },
    pricing: pricing.slice(0, 12).map((row) => ({
      plan_name: row.plan_name,
      price_amount: row.price_amount === null ? null : Number(row.price_amount),
      currency: row.currency,
      billing_period: row.billing_period,
      per_user: row.price_per_user,
      has_free_trial: row.has_free_trial,
      has_free_plan: row.has_free_plan,
      custom_pricing: row.custom_pricing,
      checked_at: row.checked_at,
      evidence_id: row.evidence_id,
      note: "Une offre payante ne prouve pas l'existence de clients payants.",
    })),
    feedback: feedbackRows,
    competitors,
    evidence_index: sourceItems,
    information_gaps: [
      summary.problem_solved.value === null ? "Problème résolu non renseigné ou non sourcé." : null,
      summary.customer_type.value === null ? "Type de clientèle inconnu." : null,
      summary.pricing_status.value === null ? "Statut tarifaire inconnu." : null,
      feedbackRows.length === 0 ? "Aucun avis client disponible dans ce contexte." : null,
      competitors.length === 0 ? "Aucune relation concurrentielle recensée." : null,
    ].filter((item): item is string => item !== null),
  };
}

/** How much SOR holds per product (RLS applies: what this member can see). */
async function productCoverage(
  client: DbClient,
  products: Array<{ id: string; name: string }>,
): Promise<ExternalResearchCoverage["products"]> {
  return Promise.all(
    products.map(async (product) => {
      const [feedback, evidence] = await Promise.all([
        client
          .from("customer_feedback")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id),
        client
          .from("evidence_items")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id),
      ]);
      return {
        product_id: product.id,
        name: product.name,
        feedback_available: feedback.error ? null : (feedback.count ?? 0),
        evidence_available: evidence.error ? null : (evidence.count ?? 0),
      };
    }),
  );
}

/** Builds a compact snapshot only from data visible to this workspace member. */
export async function buildExternalResearchContext(
  client: DbClient,
  productIds: string[],
  includedSections: ExternalResearchSection[],
): Promise<ExternalResearchContext> {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length !== productIds.length || uniqueIds.length < 1 || uniqueIds.length > 5) {
    throw new ApiError("VALIDATION_ERROR", "Sélection de produits invalide");
  }
  const products = await Promise.all(uniqueIds.map((id) => catalogRepo.getProductById(client, id)));
  if (products.some((product) => product === null)) throw new ApiError("NOT_FOUND");
  const contexts = await Promise.all(
    products.map((product) => productContext(client, product as Product)),
  );
  const overview = contexts.map((item) => item.overview);
  const sections: ExternalResearchContext["sections"] = {};
  // Sections reference their product (id, slug, name); the full product
  // overview is carried once, in `overview` (v2: duplicating it in every
  // section made a five-SaaS dossier exceed the prompt limit).
  const ref = (index: number) => ({
    id: overview[index]!.id,
    slug: overview[index]!.slug,
    name: overview[index]!.name.value,
  });
  const bySection: Record<ExternalResearchSection, Array<Record<string, unknown>>> = {
    features: contexts.map((item, index) => ({ product: ref(index), ...item.features })),
    pricing: contexts.map((item, index) => ({ product: ref(index), plans: item.pricing })),
    feedback: contexts.map((item, index) => ({ product: ref(index), items: item.feedback })),
    competitors: contexts.map((item, index) => ({
      product: ref(index),
      items: item.competitors,
    })),
  };
  for (const section of includedSections) sections[section] = bySection[section];

  const includedEvidenceIds = collectEvidenceIds({ overview, sections });
  const evidenceById = new Map<string, ExternalResearchEvidence>();
  for (const item of contexts.flatMap((context) => context.evidence_index)) {
    const id = item.evidence_id;
    if (typeof id === "string" && includedEvidenceIds.has(id)) evidenceById.set(id, item);
  }
  const subjectProducts = products.map((product) => ({
    id: (product as Product).id,
    slug: (product as Product).slug,
    name: (product as Product).name,
    website_url: (product as Product).website_url,
  }));
  return {
    context_version: EXTERNAL_CONTEXT_VERSION,
    subject: {
      type: subjectProducts.length === 1 ? "product" : "product_set",
      label: subjectProducts.map((product) => product.name).join(" · "),
      product_ids: uniqueIds,
      products: subjectProducts,
    },
    coverage: { products: await productCoverage(client, subjectProducts) },
    overview,
    sections,
    evidence_index: [...evidenceById.values()].slice(0, 40),
    information_gaps: contexts.flatMap((item, index) =>
      item.information_gaps.map((gap) => `${overview[index]?.name.value ?? "Produit"} : ${gap}`),
    ),
  };
}

/**
 * Category subject (S8.4): a bounded, stated sample of the category's visible
 * catalog SaaS (the most recently added), never the whole library.
 */
export async function buildCategoryResearchContext(
  client: DbClient,
  workspaceId: string,
  categorySlug: string,
  includedSections: ExternalResearchSection[],
): Promise<ExternalResearchContext> {
  const { data: category, error } = await client
    .from("categories")
    .select("slug, name")
    .eq("slug", categorySlug)
    .eq("is_user_visible", true)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR");
  if (!category) throw new ApiError("NOT_FOUND", "Catégorie introuvable");
  const filters = { categories: { slugs: [categorySlug] } };
  const [page, total] = await Promise.all([
    searchProducts(
      client,
      workspaceId,
      CatalogQuerySchema.parse({ filters, sort: "recently_added", limit: CATEGORY_SAMPLE_SIZE }),
    ),
    countProducts(client, workspaceId, CatalogQuerySchema.parse({ filters }).filters),
  ]);
  if (page.data.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Aucun SaaS visible dans cette catégorie");
  }
  const base = await buildExternalResearchContext(
    client,
    page.data.map((product) => product.id),
    includedSections,
  );
  return {
    ...base,
    subject: {
      ...base.subject,
      type: "category",
      label: `Catégorie : ${category.name}`,
      category_slug: category.slug,
    },
    coverage: {
      products: base.coverage?.products ?? [],
      category: {
        slug: category.slug,
        name: category.name,
        total_products: Number(total),
        sample_rule: `échantillon des ${CATEGORY_SAMPLE_SIZE} SaaS les plus récemment ajoutés au catalogue`,
      },
    },
  };
}

/**
 * Pain Point Cluster subject (S8.4): the cluster, its active problems with
 * their sources, and the products it affects. Clusters come from SOR's
 * internal Pain Point engine, whose providers are simulated until PD-24: the
 * dossier says so and asks the assistant to re-check the grouping.
 */
export async function buildClusterResearchContext(
  client: DbClient,
  workspaceId: string,
  clusterId: string,
  includedSections: ExternalResearchSection[],
): Promise<ExternalResearchContext> {
  const cluster = await getCluster(client, workspaceId, clusterId);
  const evidence = (await clusterEvidence(client, workspaceId, clusterId)).filter(
    (row) => !row.removed,
  );
  const members: ExternalResearchClusterContext["members"] = [...evidence]
    .sort(
      (a, b) =>
        (b.severity ?? 0) - (a.severity ?? 0) ||
        String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")),
    )
    .slice(0, CLUSTER_MEMBER_LIMIT)
    .map((row) => ({
      problem_statement: row.problem_statement,
      severity: row.severity,
      resolution_status: row.resolution_status,
      workaround: row.workaround,
      desired_solution: row.desired_solution,
      product_id: row.product_id,
      excerpt: short(row.excerpt, 400),
      published_at: row.published_at,
      source_name: row.source_name,
      source_url: row.evidence_url,
      evidence_id: row.evidence_id,
    }));
  const productIds = [...(cluster.products as Array<{ product_id: string; count: number }>)]
    .sort((a, b) => b.count - a.count)
    .map((p) => p.product_id)
    .slice(0, 5);
  if (productIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Ce cluster ne touche aucun SaaS visible");
  }
  const base = await buildExternalResearchContext(client, productIds, includedSections);
  return {
    ...base,
    subject: {
      ...base.subject,
      type: "pain_point_cluster",
      label: `Pain Point Cluster : ${cluster.name}`,
      cluster_id: cluster.id,
    },
    cluster: {
      id: cluster.id,
      name: cluster.name,
      description: cluster.description,
      problem_category: cluster.problem_category,
      review_status: cluster.review_status,
      algorithm_version: cluster.algorithm_version,
      statistics: {
        feedback_count: cluster.feedback_count,
        distinct_author_count: cluster.distinct_author_count,
        distinct_author_count_status: cluster.distinct_author_count_status,
        distinct_company_count: cluster.distinct_company_count,
        distinct_company_count_status: cluster.distinct_company_count_status,
        affected_product_count: cluster.affected_product_count,
        frequency_label: cluster.frequency_label,
        severity_score: cluster.severity_score,
      },
      provenance_warning:
        "Ce cluster a été proposé par le moteur Pain Point interne de SOR, dont les fournisseurs IA sont simulés tant que PD-24 n’est pas décidé : le regroupement est une hypothèse à vérifier à partir des avis cités, pas un résultat établi.",
      members,
    },
    coverage: {
      products: base.coverage?.products ?? [],
      cluster_members_available: evidence.length,
    },
    evidence_index: base.evidence_index,
  };
}
