// Fake handlers of P3, P6, P8 and P9 for tests, development and the CI
// (ADR-006, PD-08 A). Deterministic keyword heuristics, labelled "fake" in
// every recorded step: a baseline, not a model (PD-24a pending).
import type { FakeHandler } from "@sor/ai-gateway";
import type { ProblemCategory } from "@sor/contracts";
import { P3_AGENT_KEY, P6_AGENT_KEY, P8_AGENT_KEY, P9_AGENT_KEY } from "./prompts";

const CATEGORY_RULES: Array<[ProblemCategory, RegExp]> = [
  ["pricing", /\b(price|pricing|expensive|cost(s|ly)?|overpriced|too much money|plan limits?)\b/i],
  [
    "performance",
    /\b(slow|slowly|lag(s|gy)?|time(s|d)? out|timeouts?|timing out|never finish(es)?|takes forever)\b/i,
  ],
  ["bugs", /\b(bugs?|buggy|crash(es|ed)?|broken|errors?|glitch(es)?)\b/i],
  ["reliability", /\b(down|outages?|unreliable|downtime|data loss)\b/i],
  [
    "support",
    /\b(support|customer service|no (answer|response|reply)|never (answer|respond|repl))/i,
  ],
  [
    "integrations",
    /\b(integrations?|integrate|zapier|sync(s|ing)?|api|webhooks?|connect(or)?s?)\b/i,
  ],
  ["documentation", /\b(docs|documentation|tutorials?|guides?)\b/i],
  [
    "missing_features",
    /\b(missing|lacks?|no way to|wish|would love|cannot|can't|doesn't (let|allow|support))\b/i,
  ],
  ["complexity", /\b(complicated|complex|steep learning curve|overwhelming)\b/i],
  ["ux", /\b(confusing|clunky|hard to (use|find|navigate)|unintuitive|ui|ux|interface)\b/i],
  ["customization", /\b(customi[sz](e|ation)|flexib(le|ility)|configur(e|ation))\b/i],
];
const INJECTION = /\b(ignore (all )?(previous|prior) instructions|you are now|system prompt)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** P3: one problem per sentence matching a category (first one primary), at most three. */
const extract: FakeHandler = (call) => {
  const trusted = call.request.trustedInput as { feedback_id: string };
  const text = call.request.untrustedInputs[0]?.text ?? "";
  const problems: unknown[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences(text)) {
    if (INJECTION.test(sentence)) continue;
    const rule = CATEGORY_RULES.find(([, re]) => re.test(sentence));
    if (!rule || seen.has(rule[0])) continue;
    seen.add(rule[0]);
    problems.push({
      is_primary: problems.length === 0,
      problem_statement: sentence.slice(0, 300),
      problem_category: rule[0],
      feature_concerned: null,
      user_profile: null,
      severity: null,
      declared_frequency: null,
      operational_consequence: null,
      workaround: null,
      desired_solution: null,
      switching_intent: /\b(switch(ing)?|moving to|cancel(l?ing|led)?)\b/i.test(text)
        ? "stated"
        : "unknown",
      vendor_response: null,
      resolution_status: /\b(fixed|resolved|solved)\b/i.test(sentence) ? "resolved" : "unknown",
      confidence: 50,
    });
    if (problems.length === 3) break;
  }
  return { feedback_id: trusted.feedback_id, problems, injection_suspected: INJECTION.test(text) };
};

/** P6: keeps the group as is (coherent), names it after its first statement. */
const verify: FakeHandler = (call) => {
  const trusted = call.request.trustedInput as { cluster_ref: string; problem_category: string };
  const first = call.request.untrustedInputs[0]?.text ?? "Problem";
  return {
    cluster_ref: trusted.cluster_ref,
    is_coherent: true,
    proposed_name: first.slice(0, 120),
    proposed_description: `${call.request.untrustedInputs.length} similar ${trusted.problem_category} problems (fake verifier)`,
    target_persona: null,
    outlier_problem_ids: [],
    split_proposal: [],
    confidence: 50,
  };
};

interface Brief {
  id: string;
  name: string;
  problem_category: string;
  frequency_label: string;
  affected_products: Array<{ product_id: string; name: string | null }>;
  evidence_ids: string[];
}

/** P8: one gap per cluster seen in two products or more. */
const gaps: FakeHandler = (call) => {
  const { clusters } = call.request.trustedInput as { clusters: Brief[] };
  return {
    gaps: clusters
      .filter((c) => c.affected_products.length >= 2 && c.evidence_ids.length > 0)
      .slice(0, 20)
      .map((c) => ({
        title: `Shared problem: ${c.name}`.slice(0, 200),
        gap_type: "shared_problem",
        cluster_ids: [c.id],
        description: `Reported for ${c.affected_products.length} products in scope (fake gap identifier).`,
        existing_solutions_observed: [],
        absence_of_solution_is_verified: false,
        evidence: c.evidence_ids
          .slice(0, 3)
          .map((id) => ({ evidence_id: id, support_type: "supports" })),
        confidence: 30,
      })),
  };
};

/** P9: one unscored hypothesis per recurring or widespread cluster. */
const opportunities: FakeHandler = (call) => {
  const { clusters } = call.request.trustedInput as { clusters: Brief[] };
  return {
    hypotheses: clusters
      .filter((c) => c.frequency_label === "recurring" || c.frequency_label === "widespread")
      .slice(0, 10)
      .map((c) => ({
        name: `Address: ${c.name}`.slice(0, 200),
        description: `Hypothesis derived from a ${c.frequency_label} ${c.problem_category} cluster (fake generator).`,
        problem_statement: c.name,
        target_persona: "Teams using the products in scope",
        proposed_solution: `A product that removes the ${c.problem_category} problem described by the cluster.`,
        value_proposition: `Fewer ${c.problem_category} problems than the current tools.`,
        differentiation:
          "To be established: the cluster shows a problem, not a gap in every competitor.",
        existing_competitor_product_ids: c.affected_products.map((p) => p.product_id).slice(0, 20),
        business_model_hypothesis: null,
        pricing_hypothesis: null,
        technical_feasibility_notes: null,
        distribution_hypothesis: null,
        validation_needed:
          "Interview affected users and test willingness to pay; complaints alone do not prove it.",
        source_cluster_ids: [c.id],
        primary_use_case: c.name.slice(0, 300),
        core_purpose_flag: "unknown",
      })),
  };
};

export const fakePainPointHandlers: Record<string, FakeHandler> = {
  [P3_AGENT_KEY]: extract,
  [P6_AGENT_KEY]: verify,
  [P8_AGENT_KEY]: gaps,
  [P9_AGENT_KEY]: opportunities,
};
