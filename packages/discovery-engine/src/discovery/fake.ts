// Fake-provider handlers for D1/D3 (tests and local development only;
// ADR-006). Deterministic text heuristics, not an AI model; they say so in
// their output. A real provider is chosen by PD-24a.
import type { CandidateExtractionOutput, QueryPlan } from "@sor/contracts";
import type { FakeHandler, ProviderCall } from "@sor/ai-gateway";
import { D1_AGENT_KEY, D3_AGENT_KEY } from "./prompts";

const STOPWORDS = new Set(
  (
    "a an and are avec but des dans de du en et for from find in is la le les moins more of on or " +
    "ou par plus pour que qui sur the their to trouve trouvez trouve-moi un une with without " +
    "saas b2b b2c logiciels logiciel software tools outils small petits independent independants " +
    "us usa american americains americain employees employes salaries team equipe already deja " +
    "paying payants users utilisateurs underdeveloped sous developpes semblent encore seem still"
  ).split(" "),
);

const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

// Keyword → category slug (only slugs of the reference data).
const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/analytics|analytique|dashboards?/, "marketing-growth-marketing-analytics"],
  [/email|newsletter|e-mail/, "marketing-growth-email-marketing"],
  [/seo/, "marketing-growth-seo"],
  [/attribution/, "marketing-growth-attribution"],
  [/lead/, "marketing-growth-lead-generation"],
  [/marketing/, "marketing-growth"],
];

function heuristicD1(call: ProviderCall): QueryPlan {
  const input = call.request.trustedInput as {
    prompt: string;
    search_sources: string[];
    max_queries_per_source: number;
    max_candidates: number;
  };
  const text = input.prompt.toLowerCase();
  const kw = [...new Set(words(input.prompt))];
  const queries = [kw.slice(0, 2).join(" "), kw.slice(2, 4).join(" ")]
    .filter((q) => q.length >= 3)
    .slice(0, Math.max(1, input.max_queries_per_source));
  const inferred: Record<string, unknown> = {};
  if (/\bb2b\b/.test(text)) inferred.customer_types = { values: ["b2b"] };
  if (/\b(us|usa|am[eé]ricain|american|[eé]tats-unis)/.test(text)) {
    inferred.hq_countries = { values: ["US"] };
  }
  if (/(moins de 20|fewer than 20|less than 20|small team|petite [eé]quipe)/.test(text)) {
    inferred.team_size = { presets: ["1-20"] };
  }
  return {
    interpreted_intent: `fake_provider (deterministic heuristics): ${input.prompt.slice(0, 200)}`,
    mandatory_constraints: [],
    optional_preferences: [],
    category_slugs: CATEGORY_HINTS.filter(([re]) => re.test(text))
      .map(([, slug]) => slug)
      .slice(0, 3),
    inferred_filters: inferred as QueryPlan["inferred_filters"],
    queries_by_source: input.search_sources.map((source_key) => ({
      source_key,
      queries: queries.length > 0 ? queries : ["saas"],
    })),
    max_candidates: input.max_candidates,
  };
}

const PRICE = /(\$|€|£)\s?\d|\d\s?(€|\$|£|usd|eur)\b|\/\s?(month|mo|mois)\b/i;
const INJECTION =
  /(ignore (all |any )?(previous|prior|above) instructions|you are (an? )?(ai|assistant)|system prompt)/i;

function heuristicD3(call: ProviderCall): CandidateExtractionOutput {
  const page = call.request.untrustedInputs[0];
  const trusted = call.request.trustedInput as { page_url: string };
  if (!page) return { candidates: [], ignored_mentions: [], injection_suspected: false };
  const lines = page.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const title = (page.label.startsWith("http") ? null : page.label) ?? lines[0] ?? "";
  const name = (title.split(/\s[|–—-]\s/)[0] ?? "").trim().slice(0, 200);
  const sentence =
    lines.find((l) => l.length >= 20 && l.length <= 300 && !INJECTION.test(l)) ?? null;
  const injection = INJECTION.test(page.text);
  if (!name) return { candidates: [], ignored_mentions: [], injection_suspected: injection };
  return {
    candidates: [
      {
        name,
        official_url: trusted.page_url,
        tagline: sentence,
        description: sentence,
        company_name: null,
        country_code: null,
        employee_min: null,
        employee_max: null,
        founder_led: null,
        proposed_category_slugs: [],
        proposed_primary_use_case: sentence,
        core_purpose_flag: "unknown",
        billing_models: [],
        monetization_signal: PRICE.test(page.text) ? "paid_plan_available" : "unknown",
        citations: [{ source_snapshot_id: page.ref, quote_or_locator: name }],
      },
    ],
    ignored_mentions: [],
    injection_suspected: injection,
  };
}

export const fakeDiscoveryHandlers: Record<string, FakeHandler> = {
  [D1_AGENT_KEY]: heuristicD1,
  [D3_AGENT_KEY]: heuristicD3,
};
