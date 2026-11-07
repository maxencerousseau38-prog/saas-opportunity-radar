// In-memory ports of the discovery_run pipeline, for unit tests and the
// evaluation runner (no database, no network). Mirrors the database
// semantics that matter (M8): the catalog's exclusion status wins for an
// existing product, an excluded candidate is rejected, a product under
// review or a possible duplicate needs review, writes are idempotent.
import { createHash } from "node:crypto";
import type { CatalogFilters, DiscoveryLead, SourceDocument } from "@sor/contracts";
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import { failure, type ConnectorOutcome, type SourceConnector } from "@sor/data-sources";
import { nameKey, normalizeUrl, type FitFacts, type IdentityLookup } from "@sor/domain";
import type {
  CandidatePayload,
  CandidateWriteResult,
  DiscoveryPorts,
  DiscoveryRunInput,
  DiscoveryStageName,
  RunSummaryPayload,
  SeedProduct,
  SourceState,
} from "./types";

export interface MemoryPage {
  title: string | null;
  text: string;
  links?: string[];
  externalLinks?: string[];
}

export interface MemoryProduct {
  id: string;
  name: string;
  websiteUrl: string;
  exclusionStatus: "eligible" | "excluded" | "needs_review";
  visible: boolean;
  categorySlugs: string[];
  facts?: FitFacts;
}

export interface DiscoveryMemoryStore {
  steps: Map<string, { inputHash: string; output: unknown }>;
  stages: DiscoveryStageName[];
  plan: { interpretedFilters: CatalogFilters; queryPlan: unknown } | null;
  candidates: Map<string, CandidatePayload & { result: CandidateWriteResult }>;
  createdProducts: Map<string, { id: string; name: string }>;
  leads: DiscoveryLead[];
  snapshots: Map<string, SourceDocument>;
  fetches: string[];
  summary: RunSummaryPayload | null;
  usage: UsageRecord[];
  modelCalls: number;
}

export function discoveryMemoryStore(): DiscoveryMemoryStore {
  return {
    steps: new Map(),
    stages: [],
    plan: null,
    candidates: new Map(),
    createdProducts: new Map(),
    leads: [],
    snapshots: new Map(),
    fetches: [],
    summary: null,
    usage: [],
    modelCalls: 0,
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const uuidFrom = (s: string) => {
  const h = sha(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export function discoveryMemoryPorts(options: {
  run: DiscoveryRunInput;
  gateway: AIGateway;
  sources?: SourceState[];
  searchConnectors?: Record<string, SourceConnector>;
  pages?: Record<string, MemoryPage | "unavailable" | "error">;
  catalog?: MemoryProduct[];
  /** Visible category slugs and their parent (null for a top-level slug). */
  categories?: Record<string, string | null>;
  store?: DiscoveryMemoryStore;
  budgetUsd?: number;
  stop?: () => "cancelled" | "budget" | null;
  /** Last allowed attempt of the job (S7.5b, F9); absent: transient failures are retried. */
  finalAttempt?: boolean;
  now?: Date;
}): { ports: DiscoveryPorts; store: DiscoveryMemoryStore } {
  const store = options.store ?? discoveryMemoryStore();
  const now = options.now ?? new Date("2026-11-06T12:00:00Z");
  const catalog = options.catalog ?? [];
  const categories = options.categories ?? {
    "marketing-growth": null,
    "marketing-growth-marketing-analytics": "marketing-growth",
    "marketing-growth-email-marketing": "marketing-growth",
  };
  let spent = 0;
  const canonical = (url: string) => {
    try {
      return normalizeUrl(url).canonicalUrl;
    } catch {
      return url;
    }
  };
  const pageFor = (url: string) => {
    const pages = options.pages ?? {};
    return pages[url] ?? pages[canonical(url)] ?? pages[`${canonical(url)}/`];
  };

  const ports: DiscoveryPorts = {
    ...(options.finalAttempt === undefined
      ? {}
      : { finalAttempt: () => options.finalAttempt === true }),
    loadRun: async () => options.run,
    sourceStates: async () =>
      options.sources ?? [
        {
          sourceKey: "hacker_news",
          enabled: false,
          termsUrl: null,
          storagePolicy: "metadata_only",
        },
        { sourceKey: "official_website", enabled: true, termsUrl: null, storagePolicy: "full" },
        { sourceKey: "user_import", enabled: true, termsUrl: null, storagePolicy: "full" },
      ],
    searchConnector: (key) => options.searchConnectors?.[key] ?? null,
    fetchOfficialPage: async (url): Promise<ConnectorOutcome<SourceDocument>> => {
      store.fetches.push(url);
      const page = pageFor(url);
      if (page === undefined || page === "unavailable")
        return failure("unavailable", "http_404", false);
      if (page === "error") return failure("error", "http_503", true);
      return {
        status: "ok",
        data: {
          source_key: "official_website",
          canonical_url: canonical(url),
          external_id: null,
          title: page.title,
          text: page.text,
          published_at: null,
          retrieved_at: now.toISOString(),
          content_hash: sha(page.text),
          fetch_status: "ok",
          http_status: 200,
          storage_permitted: "excerpt",
          metadata: { links: page.links ?? [], external_links: page.externalLinks ?? [] },
        },
      };
    },
    recordSnapshot: async (doc) => {
      const id = uuidFrom(`${doc.canonical_url}|${doc.content_hash}`);
      store.snapshots.set(id, doc);
      return id;
    },
    recordLead: async (lead) => {
      store.leads.push(lead);
      return null;
    },
    loadSeeds: async ({ productIds, categorySlugs, max }): Promise<SeedProduct[]> =>
      catalog
        .filter((p) => p.visible && p.exclusionStatus === "eligible")
        .filter((p) =>
          productIds.length > 0
            ? productIds.includes(p.id)
            : p.categorySlugs.some(
                (s) => categorySlugs.includes(s) || categorySlugs.includes(categories[s] ?? ""),
              ),
        )
        .slice(0, max)
        .map((p) => ({ id: p.id, name: p.name, websiteUrl: p.websiteUrl })),
    identityLookup: async (c): Promise<IdentityLookup> => {
      const url = c.officialUrl ? canonical(c.officialUrl) : null;
      const byUrl = url ? catalog.find((p) => canonical(p.websiteUrl) === url) : undefined;
      const domain = url ? normalizeUrl(url).registrableDomain : null;
      return {
        productByCanonicalUrl: byUrl?.id ?? null,
        productByExternalId: null,
        productsByDomain: domain
          ? catalog
              .filter((p) => normalizeUrl(p.websiteUrl).registrableDomain === domain)
              .map((p) => p.id)
          : [],
        companyByDomain: null,
        similarNameProducts: catalog
          .filter((p) => nameKey(p.name) === nameKey(c.name))
          .map((p) => ({ id: p.id, name: p.name })),
      };
    },
    catalogFacts: async (id) => catalog.find((p) => p.id === id)?.facts ?? null,
    categoryClosure: async (slugs) => {
      const known = slugs.filter((s) => s in categories);
      const withParents = [
        ...new Set(known.flatMap((s) => [s, categories[s]].filter((x): x is string => !!x))),
      ];
      return { known, withParents };
    },
    setStage: async (s) => {
      store.stages.push(s);
    },
    savePlan: async ({ interpretedFilters, queryPlan }) => {
      store.plan = { interpretedFilters, queryPlan };
    },
    upsertCandidate: async (payload) => {
      const existing = payload.identity.product_id
        ? catalog.find((p) => p.id === payload.identity.product_id)
        : undefined;
      let productId = existing?.id;
      if (!productId) {
        const key = payload.product.canonical_url ?? `name:${payload.product.name.toLowerCase()}`;
        const created = store.createdProducts.get(key) ?? {
          id: uuidFrom(key),
          name: payload.product.name,
        };
        store.createdProducts.set(key, created);
        productId = created.id;
      }
      const status = existing ? existing.exclusionStatus : payload.exclusion.status;
      const review: CandidateWriteResult["review_status"] =
        status === "excluded"
          ? "rejected"
          : status === "needs_review" || payload.identity.outcome === "needs_review"
            ? "needs_review"
            : payload.review_status;
      const result: CandidateWriteResult = {
        candidate_id: uuidFrom(`candidate|${productId}`),
        product_id: productId,
        identity_decision: payload.identity.outcome,
        is_new_to_catalog: !existing,
        exclusion_status: status,
        review_status: review,
      };
      if (status !== "eligible" && payload.fit.fit_score !== null) {
        // The database stores no fit score for a non-eligible candidate.
        payload = { ...payload, fit: { ...payload.fit, fit_score: null, fit_coverage: null } };
      }
      store.candidates.set(productId, { ...payload, result });
      return result;
    },
    finalize: async (summary) => {
      store.summary = summary;
    },
    step: async (meta, run) => {
      const key = `${meta.agentKey}/${meta.stepKey}`;
      const done = store.steps.get(key);
      if (done && done.inputHash === meta.inputHash) {
        return { output: done.output as never, stepId: key, reused: true };
      }
      const res = await run(key);
      if (res.model) store.modelCalls++;
      store.steps.set(key, { inputHash: meta.inputHash, output: res.output });
      return { output: res.output, stepId: key, reused: false };
    },
    gateway: options.gateway,
    remainingAiBudgetUsd: () => Math.max(0, (options.budgetUsd ?? 0) - spent),
    recordUsage: async (_stepId, u) => {
      store.usage.push(u);
      if (u.outcome !== "budget_refused") spent += u.reportedCostUsd ?? u.estimatedCostUsd ?? 0;
    },
    stopReason: options.stop ?? (() => null),
    now: () => now,
    signal: new AbortController().signal,
  };
  return { ports, store };
}
