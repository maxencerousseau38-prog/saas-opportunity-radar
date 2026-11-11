// discovery_run pipeline (Implementation Blueprint §6.1–6.9; PD-28 channels):
// planning (D1 + server guard) → searching (D2: search connectors, controlled
// official-site rebound, seed URLs) → extracting (D3 on each lead's official
// site) → resolving_identity (D4) → classifying_exclusion (§5.4) → filtering
// and ranking (D7, deterministic) → persisting. Each stage is persisted as a
// keyed step: a resumed job reuses completed steps instead of repeating them.
//
// [ASSUMPTION] The run's "enriching/verifying" stages are the official-site
// extraction and its deterministic checks (cited snapshot given to the step,
// candidate name present in it, official URL on the fetched site). Full D5/D6
// enrichment of a candidate runs as the existing product_enrichment job.
import {
  CANDIDATE_EXTRACTION_CONTRACT_VERSION,
  CandidateExtractionOutputSchema,
  QUERY_PLAN_CONTRACT_VERSION,
  QueryPlanSchema,
  type CandidateExtractionOutput,
  type DiscoveryLead,
  type ExtractedCandidate,
  type QueryPlan,
  type SourceReportEntry,
} from "@sor/contracts";
import {
  DEFAULT_REBOUND_CONTROLS,
  DISCOVERY_SOURCES,
  extractReboundLeads,
  isExcludedReboundDomain,
  selectReboundPages,
} from "@sor/data-sources";
import {
  DISCOVERY_BUDGETS,
  FIT_RULES_VERSION,
  aggregateQuality,
  classifyExclusion,
  computeFit,
  excludedThemeRule,
  mergeFitFilters,
  normalizeForMatch,
  normalizeUrl,
  resolveIdentity,
  sanitizeQueryPlan,
  type FitFacts,
  type FitResult,
  type IdentityDecision,
  type QualityEvidence,
} from "@sor/domain";
import { GatewayError } from "@sor/ai-gateway";
import { hashOf } from "../enrichment/pipeline";
import {
  D1_AGENT_KEY,
  D1_INSTRUCTIONS,
  D1_PROMPT_VERSION,
  D3_AGENT_KEY,
  D3_INSTRUCTIONS,
  D3_PROMPT_VERSION,
} from "./prompts";
import type {
  CandidatePayload,
  CandidateWriteResult,
  DiscoveryOutcome,
  DiscoveryPorts,
  DiscoveryStageName,
  RunSummaryPayload,
} from "./types";

class StopSignal extends Error {
  constructor(readonly reason: "cancelled" | "budget") {
    super(reason);
  }
}

type Limitation = { code: string; detail: string };

interface LeadRecord {
  lead: DiscoveryLead;
  domain: string;
}

interface SearchStageOutput {
  leads: DiscoveryLead[];
  leadsFound: number;
  duplicateLeads: number;
  report: SourceReportEntry[];
  limitations: Limitation[];
}

type ExtractStep =
  | {
      snapshot_id: string;
      page_url: string;
      retrieved_at: string;
      page_text_key: string;
      extraction: CandidateExtractionOutput;
    }
  | { failure: { status: string; reason: string } };

interface WorkingCandidate {
  lead: DiscoveryLead;
  leadDomain: string;
  snapshotId: string;
  retrievedAt: string;
  extracted: ExtractedCandidate;
  officialUrl: string | null;
  domain: string | null;
  identity?: IdentityDecision;
  exclusion?: ReturnType<typeof classifyExclusion>;
  fit?: FitResult;
  confidence?: number;
  reviewStatus?: "pending" | "rejected";
  rejectionReason?: string | null;
  categorySlugs: string[];
  categoryClosure: string[];
  provenance: Array<Record<string, unknown>>;
}

const domainOf = (url: string): string | null => {
  try {
    return normalizeUrl(url).registrableDomain;
  } catch {
    return null;
  }
};

const report = (
  sourceKey: string,
  channel: SourceReportEntry["channel"],
  status: SourceReportEntry["status"],
  extra: Partial<SourceReportEntry> = {},
): SourceReportEntry => {
  const d = DISCOVERY_SOURCES[sourceKey];
  return {
    source_key: sourceKey,
    channel,
    status,
    requests: 0,
    leads: 0,
    limits_reached: [],
    errors: [],
    terms_url: d?.termsUrl ?? null,
    storage_policy: d?.storagePolicy ?? "transient",
    ...extra,
  };
};

const FIT_GROUP_LABELS: Record<string, string> = {
  customer_types: "type de clientèle",
  team_size: "taille de l’équipe",
  hq_countries: "pays",
  age: "ancienneté",
  categories: "catégorie",
  billing_models: "modèle de facturation",
  price_bands: "prix",
  commercial_validation: "validation commerciale",
  company_profile: "profil de l’entreprise",
  pref_independent: "indépendance",
  pref_founder_led: "fondateur aux commandes",
  pref_small_team: "petite équipe",
  pref_paid_offer: "offre payante",
};

/** Deterministic French reason shown next to a candidate (PRD §6.3 étape 6). */
export function recommendationReason(fit: FitResult, confidence: number): string {
  if (fit.fit_score === null) {
    return fit.not_scored_reason === "not_eligible"
      ? "Non évalué : produit exclu ou en revue."
      : `Correspondance non calculable : aucune information connue sur les critères demandés. Confiance des preuves ${confidence}/100.`;
  }
  const known = fit.groups.filter((g) => g.outcome !== "unknown");
  const met = known
    .filter((g) => g.outcome === "satisfied")
    .map((g) => FIT_GROUP_LABELS[g.key] ?? g.key);
  const missing = fit.missing_information.map((k) => FIT_GROUP_LABELS[k] ?? k);
  return (
    `Correspondance ${fit.fit_score}/100 sur ${known.length} critère(s) connu(s)` +
    (met.length ? ` (respectés : ${met.join(", ")})` : "") +
    `. Couverture ${fit.fit_coverage}/100` +
    (missing.length ? ` ; inconnu : ${missing.join(", ")}` : "") +
    `. Confiance des preuves ${confidence}/100.`
  );
}

export async function runDiscovery(ports: DiscoveryPorts): Promise<DiscoveryOutcome> {
  const limitations: Limitation[] = [];
  const warnings: string[] = [];
  const written: CandidateWriteResult[] = [];
  const summary: RunSummaryPayload = {
    leads_found: 0,
    candidates_found: 0,
    duplicates_removed: 0,
    sources_report: [],
    limitations: [],
    error_summary: null,
  };
  const checkpoint = () => {
    const reason = ports.stopReason();
    if (reason) throw new StopSignal(reason);
  };
  const stage = async (s: DiscoveryStageName) => {
    checkpoint();
    await ports.setStage(s);
  };
  let partial = false;

  try {
    const run = await ports.loadRun();
    const budget = DISCOVERY_BUDGETS[run.depth];
    const states = await ports.sourceStates();
    const enabled = new Set(states.filter((s) => s.enabled).map((s) => s.sourceKey));
    const searchSources = Object.values(DISCOVERY_SOURCES)
      .filter((d) => d.channel === "search")
      .map((d) => d.sourceKey);
    const availableSearch = searchSources.filter((k) => enabled.has(k));

    // ---------------------------------------------------------------- planning (D1)
    await stage("planning");
    const d1 = await ports.step<QueryPlan>(
      {
        agentKey: D1_AGENT_KEY,
        stepKey: "plan",
        contractVersion: QUERY_PLAN_CONTRACT_VERSION,
        promptVersion: D1_PROMPT_VERSION,
        inputHash: hashOf({ prompt: run.prompt, filters: run.explicitFilters, availableSearch }),
      },
      async (stepId) => {
        const res = await ports.gateway.generate(
          {
            agentKey: D1_AGENT_KEY,
            contractVersion: QUERY_PLAN_CONTRACT_VERSION,
            promptVersion: D1_PROMPT_VERSION,
            systemInstructions: D1_INSTRUCTIONS,
            untrustedInputs: [],
            trustedInput: {
              prompt: run.prompt,
              explicit_filters: run.explicitFilters,
              search_sources: availableSearch,
              max_queries_per_source: budget.queries_per_source,
              max_candidates: run.maxResults,
            },
            schema: QueryPlanSchema,
            modelProfile: "classification",
            maxOutputTokens: 2000,
            timeoutMs: 60_000,
            maxCostUsd: ports.remainingAiBudgetUsd(),
          },
          {
            remainingBudgetUsd: ports.remainingAiBudgetUsd(),
            allowedIds: new Set(),
            recordUsage: (u) => ports.recordUsage(stepId, u),
            signal: ports.signal,
          },
        );
        return {
          output: res.data,
          model: {
            provider: res.provider,
            name: res.model,
            costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
            latencyMs: res.usage.latencyMs,
          },
        };
      },
    );
    // Server guard (§6.2): the planner cannot weaken exclusions or exceed the budget.
    const guarded = sanitizeQueryPlan({
      plan: d1.output,
      prompt: run.prompt,
      availableSearchSources: availableSearch,
      maxQueriesPerSource: budget.queries_per_source,
      maxResults: run.maxResults,
    });
    const plan = guarded.plan;
    limitations.push(...guarded.limitations);
    const { merged: interpreted } = mergeFitFilters(run.explicitFilters, plan.inferred_filters);
    await ports.savePlan({
      interpretedFilters: interpreted,
      queryPlan: plan,
      limitations: guarded.limitations,
    });

    // ---------------------------------------------------------------- searching (D2)
    await stage("searching");
    const search = await ports.step<SearchStageOutput>(
      {
        agentKey: "D2_source_search",
        stepKey: "search",
        contractVersion: "d2.search.v1",
        promptVersion: null,
        inputHash: hashOf({ plan, channels: run.channels, enabled: [...enabled].sort() }),
      },
      async () => {
        const out: SearchStageOutput = {
          leads: [],
          leadsFound: 0,
          duplicateLeads: 0,
          report: [],
          limitations: [],
        };
        const seen = new Set<string>();
        const add = (lead: DiscoveryLead): boolean => {
          const d = domainOf(lead.lead_url);
          if (!d || isExcludedReboundDomain(d)) return false;
          out.leadsFound++;
          if (seen.has(d)) {
            out.duplicateLeads++;
            return false;
          }
          if (out.leads.length >= budget.leads) {
            if (!out.limitations.some((l) => l.code === "lead_budget_reached")) {
              out.limitations.push({ code: "lead_budget_reached", detail: String(budget.leads) });
            }
            return false;
          }
          seen.add(d);
          out.leads.push(lead);
          return true;
        };
        const retrievedAt = ports.now().toISOString();

        // Seed URLs supplied by the user (PD-28 "import CSV").
        for (const url of run.channels.seed_urls) {
          add({
            source_key: "user_import",
            channel: "seed_url",
            lead_url: url,
            title: null,
            external_id: null,
            source_reference_url: null,
            published_at: null,
            retrieved_at: retrievedAt,
            via_product_id: null,
            query: null,
            storage_policy: "full",
          });
        }

        // Search connectors (Hacker News official API once enabled).
        if (run.channels.search) {
          for (const key of searchSources) {
            const queries = plan.queries_by_source.find((q) => q.source_key === key)?.queries ?? [];
            const connector = enabled.has(key)
              ? ports.searchConnector(key, budget.search_requests_per_source)
              : null;
            if (!connector) {
              out.report.push(report(key, "search", "not_enabled"));
              out.limitations.push({ code: "source_not_enabled", detail: key });
              continue;
            }
            let leads = 0;
            let status: SourceReportEntry["status"] = "consulted";
            const errors: string[] = [];
            for (const query of queries) {
              checkpoint();
              const res = await connector.search({ query, limit: budget.leads }, ports.signal);
              if (res.status !== "ok") {
                status =
                  res.status === "rate_limited"
                    ? "rate_limited"
                    : res.status === "unavailable"
                      ? "unavailable"
                      : "error";
                errors.push(`${res.status}: ${res.reason}`.slice(0, 300));
                break; // partial results: never invent substitutes
              }
              for (const r of res.data) {
                const lead: DiscoveryLead = {
                  source_key: key,
                  channel: "search",
                  lead_url: r.url,
                  title: r.title.slice(0, 500),
                  external_id: r.externalId ?? null,
                  source_reference_url: r.referenceUrl ?? null,
                  published_at: r.publishedAt ?? null,
                  retrieved_at: retrievedAt,
                  via_product_id: null,
                  query,
                  storage_policy: DISCOVERY_SOURCES[key]?.storagePolicy ?? "transient",
                };
                if (add(lead)) {
                  leads++;
                  await ports.recordLead(lead);
                }
              }
            }
            const usage = ports.searchUsage?.(key) ?? null;
            if (usage?.limitsReached.length && status === "consulted") status = "budget_exhausted";
            out.report.push(
              report(key, "search", status, {
                requests: usage?.requests ?? queries.length,
                leads,
                limits_reached: usage?.limitsReached ?? [],
                errors: [...errors, ...(usage?.errors ?? [])].slice(0, 10),
              }),
            );
          }
        }

        // Controlled rebound from catalogued products' official sites.
        const rebound = run.channels.official_site_rebound;
        if (rebound.enabled) {
          if (!enabled.has("official_website")) {
            out.report.push(report("official_website", "official_site_rebound", "not_enabled"));
          } else {
            const categorySlugs = [
              ...new Set([
                ...(run.explicitFilters.categories?.slugs ?? []),
                ...plan.category_slugs,
              ]),
            ];
            const seeds = await ports.loadSeeds({
              productIds: rebound.seed_product_ids,
              categorySlugs,
              max: budget.rebound_seeds,
            });
            let requests = 0;
            let leads = 0;
            const errors: string[] = [];
            const known = new Set<string>();
            for (const seed of seeds) {
              checkpoint();
              const seedDomain = domainOf(seed.websiteUrl);
              if (!seedDomain) continue;
              known.add(seedDomain);
              requests++;
              const home = await ports.fetchOfficialPage(seed.websiteUrl);
              if (home.status !== "ok") {
                errors.push(`${seedDomain}: ${home.status} ${home.reason}`.slice(0, 300));
                continue;
              }
              await ports.recordSnapshot(home.data);
              for (const pageUrl of selectReboundPages(home.data, DEFAULT_REBOUND_CONTROLS)) {
                checkpoint();
                requests++;
                const page = await ports.fetchOfficialPage(pageUrl);
                if (page.status !== "ok") {
                  errors.push(`${pageUrl}: ${page.status}`.slice(0, 300));
                  continue;
                }
                await ports.recordSnapshot(page.data);
                for (const l of extractReboundLeads(
                  page.data,
                  seedDomain,
                  DEFAULT_REBOUND_CONTROLS,
                  known,
                )) {
                  known.add(l.registrableDomain);
                  if (
                    add({
                      source_key: "official_website",
                      channel: "official_site_rebound",
                      lead_url: l.leadUrl,
                      title: null,
                      external_id: null,
                      source_reference_url: l.sourcePageUrl,
                      published_at: null,
                      retrieved_at: retrievedAt,
                      via_product_id: seed.id,
                      query: null,
                      storage_policy: "full",
                    })
                  )
                    leads++;
                }
              }
            }
            if (seeds.length === 0)
              out.limitations.push({ code: "no_rebound_seed", detail: categorySlugs.join(",") });
            out.report.push(
              report("official_website", "official_site_rebound", "consulted", {
                requests,
                leads,
                errors: errors.slice(0, 10),
              }),
            );
          }
        }
        if (run.channels.seed_urls.length > 0) {
          out.report.push(
            report("user_import", "seed_url", "consulted", {
              leads: run.channels.seed_urls.length,
            }),
          );
        }
        return { output: out };
      },
    );
    limitations.push(...search.output.limitations);
    summary.sources_report = search.output.report;
    summary.leads_found = search.output.leadsFound;
    summary.duplicates_removed = search.output.duplicateLeads;
    if (
      search.output.report.some((r) =>
        ["error", "unavailable", "rate_limited", "budget_exhausted"].includes(r.status),
      )
    ) {
      partial = true;
    }
    if (search.output.leads.length === 0) limitations.push({ code: "no_lead", detail: "" });

    // ---------------------------------------------------------------- extracting (D3)
    await stage("extracting");
    const leadRecords: LeadRecord[] = search.output.leads
      .map((lead) => ({ lead, domain: domainOf(lead.lead_url) ?? "" }))
      .filter((l) => l.domain !== "");
    if (leadRecords.length > budget.extraction_calls) {
      limitations.push({
        code: "extraction_budget_reached",
        detail: String(budget.extraction_calls),
      });
    }
    const working: WorkingCandidate[] = [];
    let fetchFailures = 0;
    for (const { lead, domain } of leadRecords.slice(0, budget.extraction_calls)) {
      checkpoint();
      const step = await ports.step<ExtractStep>(
        {
          agentKey: D3_AGENT_KEY,
          stepKey: `lead:${domain}`,
          contractVersion: CANDIDATE_EXTRACTION_CONTRACT_VERSION,
          promptVersion: D3_PROMPT_VERSION,
          inputHash: hashOf({ url: lead.lead_url }),
        },
        async (stepId) => {
          const page = await ports.fetchOfficialPage(lead.lead_url);
          if (page.status !== "ok") {
            // Retried by the job while attempts remain; on the last attempt the
            // lead is recorded as unreachable (S7.5b, F9), never substituted.
            if (page.retryable && !ports.finalAttempt?.()) {
              throw Object.assign(new Error(page.reason), {
                code: `FETCH_${page.status.toUpperCase()}`,
              });
            }
            return { output: { failure: { status: page.status, reason: page.reason } } };
          }
          const snapshotId = await ports.recordSnapshot(page.data);
          const res = await ports.gateway.generate(
            {
              agentKey: D3_AGENT_KEY,
              contractVersion: CANDIDATE_EXTRACTION_CONTRACT_VERSION,
              promptVersion: D3_PROMPT_VERSION,
              systemInstructions: D3_INSTRUCTIONS,
              untrustedInputs: [
                {
                  label: page.data.title ?? page.data.canonical_url,
                  ref: snapshotId,
                  text: page.data.text,
                },
              ],
              trustedInput: { page_url: page.data.canonical_url, lead_title: lead.title },
              schema: CandidateExtractionOutputSchema,
              modelProfile: "fast_extraction",
              maxOutputTokens: 3000,
              timeoutMs: 90_000,
              maxCostUsd: ports.remainingAiBudgetUsd(),
            },
            {
              remainingBudgetUsd: ports.remainingAiBudgetUsd(),
              allowedIds: new Set([snapshotId]),
              recordUsage: (u) => ports.recordUsage(stepId, u),
              signal: ports.signal,
            },
          );
          return {
            output: {
              snapshot_id: snapshotId,
              page_url: page.data.canonical_url,
              retrieved_at: page.data.retrieved_at,
              page_text_key: normalizeForMatch(page.data.text).slice(0, 20_000),
              extraction: res.data,
            },
            model: {
              provider: res.provider,
              name: res.model,
              costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
              latencyMs: res.usage.latencyMs,
            },
          };
        },
      );
      if ("failure" in step.output) {
        fetchFailures++;
        warnings.push(
          `lead_unreachable:${domain}:${step.output.failure.status}:${step.output.failure.reason}`,
        );
        continue;
      }
      const ex = step.output;
      if (ex.extraction.injection_suspected) {
        limitations.push({ code: "injection_suspected", detail: domain });
      }
      // Deterministic checks of the extraction (the run's "verifying").
      const pageDomain = domainOf(ex.page_url);
      const extracted = ex.extraction.candidates.find((c) => {
        const d = c.official_url ? domainOf(c.official_url) : pageDomain;
        return d === pageDomain;
      });
      if (!extracted) continue;
      if (!ex.page_text_key.includes(normalizeForMatch(extracted.name))) {
        warnings.push(`name_not_in_page:${domain}`);
        continue;
      }
      // The official URL must be on the fetched site; otherwise identity review.
      const officialUrl =
        extracted.official_url && domainOf(extracted.official_url) === pageDomain
          ? normalizeUrl(new URL(extracted.official_url).origin).canonicalUrl
          : null;
      working.push({
        lead,
        leadDomain: domain,
        snapshotId: ex.snapshot_id,
        retrievedAt: ex.retrieved_at,
        extracted,
        officialUrl,
        domain: pageDomain,
        categorySlugs: [],
        categoryClosure: [],
        provenance: [
          {
            source_key: lead.source_key,
            channel: lead.channel,
            source_reference_url: lead.source_reference_url,
            via_product_id: lead.via_product_id,
            query: lead.query,
            external_id: lead.external_id,
          },
        ],
      });
    }
    if (fetchFailures > 0) partial = true;
    summary.candidates_found = working.length;

    // ---------------------------------------------------------------- resolving_identity (D4)
    await stage("resolving_identity");
    const byProduct = new Map<string, WorkingCandidate>();
    const resolved: WorkingCandidate[] = [];
    for (const c of working) {
      checkpoint();
      const candidate = {
        name: c.extracted.name,
        officialUrl: c.officialUrl,
        description: c.extracted.description,
        sourceKey: c.lead.source_key,
        externalId: c.lead.external_id,
      };
      c.identity = resolveIdentity(candidate, await ports.identityLookup(candidate));
      const key =
        c.identity.outcome === "matched_existing"
          ? `p:${c.identity.productId}`
          : `u:${c.officialUrl ?? c.extracted.name}`;
      const first = byProduct.get(key);
      if (first) {
        // Same product reached twice: one candidate, both provenances.
        first.provenance.push(...c.provenance);
        summary.duplicates_removed++;
        continue;
      }
      byProduct.set(key, c);
      resolved.push(c);
    }

    // ---------------------------------------------------------------- classifying_exclusion (§5.4)
    await stage("classifying_exclusion");
    for (const c of resolved) {
      const closure = await ports.categoryClosure(c.extracted.proposed_category_slugs);
      c.categorySlugs = closure.known;
      c.categoryClosure = closure.withParents;
      c.exclusion = classifyExclusion({
        primaryCategorySlugs: c.extracted.proposed_category_slugs,
        name: c.extracted.name,
        tagline: c.extracted.tagline,
        primaryUseCase: c.extracted.proposed_primary_use_case,
        secondaryTexts: c.extracted.description ? [c.extracted.description] : [],
        featureTexts: [],
        llmCorePurposeFlag: c.extracted.core_purpose_flag,
      });
      // The classifier decides on the candidate's own official site only: how
      // the lead was found never makes a product eligible.
    }

    // ---------------------------------------------------------------- filtering + ranking (D7)
    await stage("filtering");
    const year = ports.now().getUTCFullYear();
    for (const c of resolved) {
      const status = c.exclusion!.status;
      const facts: FitFacts =
        (c.identity!.outcome === "matched_existing"
          ? await ports.catalogFacts(c.identity!.productId)
          : null) ?? factsFromExtraction(c, c.categoryClosure);
      c.fit = computeFit({
        explicitFilters: run.explicitFilters,
        inferredFilters: plan.inferred_filters,
        facts,
        exclusionStatus: status,
        currentYear: year,
      });
      const quality: QualityEvidence[] = [
        {
          sourceRecordId: `official:${c.domain}`,
          reliabilityLevel: 1,
          verificationStatus: "unverified",
          datedAt: c.retrievedAt,
          inOpenConflict: false,
        },
        ...c.provenance
          .filter((p) => p.channel === "search")
          .map((p, i): QualityEvidence => ({
            sourceRecordId: `lead:${String(p.source_key)}:${i}`,
            reliabilityLevel: 3,
            verificationStatus: "unverified",
            datedAt: c.lead.published_at ?? c.lead.retrieved_at,
            inOpenConflict: false,
          })),
      ];
      c.confidence = Math.round(100 * aggregateQuality(quality, ports.now()));
      const reasons = [
        ...c.fit.hard_filter_failures.map((g) => `filter_mismatch:${g}`),
        ...c.fit.configurable_exclusion_hits.map((x) => `configurable_exclusion:${x}`),
      ];
      c.reviewStatus = reasons.length > 0 ? "rejected" : "pending";
      c.rejectionReason = reasons.length > 0 ? reasons.join(",").slice(0, 1000) : null;
    }

    await stage("ranking");
    const ranked = [...resolved].sort((a, b) => {
      const fa = a.fit?.fit_score ?? -1;
      const fb = b.fit?.fit_score ?? -1;
      if (fb !== fa) return fb - fa;
      if ((b.confidence ?? 0) !== (a.confidence ?? 0))
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      return a.extracted.name.localeCompare(b.extracted.name);
    });
    let kept = 0;
    for (const c of ranked) {
      if (
        c.reviewStatus !== "pending" ||
        c.exclusion!.status !== "eligible" ||
        c.identity!.outcome === "needs_review"
      )
        continue;
      kept++;
      if (kept > Math.min(plan.max_candidates, run.maxResults)) {
        c.reviewStatus = "rejected";
        c.rejectionReason = "beyond_max_results";
      }
    }

    // ---------------------------------------------------------------- persisting
    await stage("persisting");
    for (const c of ranked) {
      checkpoint();
      const id = c.identity!;
      const payload: CandidatePayload = {
        identity:
          id.outcome === "matched_existing"
            ? { outcome: "matched_existing", product_id: id.productId }
            : id.outcome === "new"
              ? { outcome: "new", company_id: id.companyId }
              : {
                  outcome: "needs_review",
                  possible_duplicate_of_product_id: id.possibleDuplicateOf,
                },
        snapshot_id: c.snapshotId,
        product: {
          name: c.extracted.name,
          canonical_url: c.officialUrl,
          domain: c.officialUrl ? c.domain : null,
          tagline: c.extracted.tagline,
          description: c.extracted.description,
          company_name: c.extracted.company_name,
          country_code: c.extracted.country_code,
          employee_min: c.extracted.employee_min,
          employee_max: c.extracted.employee_max,
          founder_led: c.extracted.founder_led,
          category_slugs: c.categorySlugs,
        },
        exclusion: {
          status: c.exclusion!.status,
          rule_set_version: c.exclusion!.ruleSetVersion,
          matched_rules: c.exclusion!.matchedRules,
          incidental_mentions: c.exclusion!.incidentalMentions,
        },
        fit: {
          rules_version: FIT_RULES_VERSION,
          fit_score: c.fit!.fit_score,
          fit_coverage: c.fit!.fit_coverage,
          breakdown: {
            groups: c.fit!.groups,
            configurable_exclusion_hits: c.fit!.configurable_exclusion_hits,
          },
          missing_information: c.fit!.missing_information,
        },
        confidence_score: c.confidence ?? 0,
        recommendation_reason: recommendationReason(c.fit!, c.confidence ?? 0),
        review_status: c.reviewStatus ?? "pending",
        rejection_reason: c.rejectionReason ?? null,
        provenance: c.provenance,
      };
      const res = await ports.step<CandidateWriteResult>(
        {
          agentKey: "D7_persist",
          stepKey: `candidate:${c.domain ?? c.extracted.name}`,
          contractVersion: "d7.persist.v1",
          promptVersion: null,
          inputHash: hashOf(payload),
        },
        async () => ({ output: await ports.upsertCandidate(payload) }),
      );
      written.push(res.output);
    }

    summary.limitations = dedupe(limitations);
    summary.candidates_found = Math.max(summary.candidates_found, written.length);
    await ports.finalize(summary);
    return {
      state: partial ? "partial" : "completed",
      terminalReason: partial ? "partial" : "completed",
      summary: { ...summary, candidates: written, warnings },
    };
  } catch (err) {
    summary.limitations = dedupe(limitations);
    if (err instanceof StopSignal) {
      return err.reason === "cancelled"
        ? {
            state: "cancelled",
            terminalReason: "cancelled",
            summary: { ...summary, candidates: written, warnings },
          }
        : {
            state: "partial",
            terminalReason: "budget_exhausted",
            summary: { ...summary, candidates: written, warnings },
          };
    }
    if (err instanceof GatewayError && err.code === "BUDGET_EXHAUSTED") {
      warnings.push("ai_budget_exhausted");
      return {
        state: "partial",
        terminalReason: "budget_exhausted",
        summary: { ...summary, candidates: written, warnings },
      };
    }
    throw err;
  }
}

function dedupe(items: Limitation[]): Limitation[] {
  return [...new Map(items.map((l) => [`${l.code}|${l.detail}`, l])).values()];
}

/** Facts of a new candidate from its extraction only; everything else unknown. */
function factsFromExtraction(c: WorkingCandidate, categoryClosure: string[]): FitFacts {
  const e = c.extracted;
  const paid = e.monetization_signal === "paid_plan_available";
  return {
    customer_type: null,
    employee_min: e.employee_min,
    employee_max: e.employee_max,
    hq_country: e.country_code,
    founded_year: null,
    launch_year: null,
    category_slugs: categoryClosure,
    primary_parent_category_slug: null,
    billing_models: e.billing_models,
    pricing_status: "unknown",
    min_monthly_eur: null,
    has_custom_plan: false,
    has_paid_plan: paid,
    // Nothing is verified during a run: a paid plan never proves paying customers.
    verified_paying_evidence_count: 0,
    has_customer_feedback: false,
    signal_types: [],
    company_type: null,
    funding_status: null,
    founder_led: e.founder_led,
    product_status: "unknown",
    workspace_status: null,
  };
}

/** True when a planned query targets an excluded theme (exposed for tests). */
export const isExcludedQuery = (q: string) => excludedThemeRule(q) !== null;
