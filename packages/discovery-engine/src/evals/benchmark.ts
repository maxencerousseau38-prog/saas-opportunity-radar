// PD-24a benchmark core: runs one evaluation case through the production
// enrichment pipeline (in-memory ports, frozen pages, no database) and scores
// the applied plan against the case's annotations. The worker's runner adds
// files, configurations and the spending cap.
import type { SourceDocument } from "@sor/contracts";
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import { normalizeForMatch } from "@sor/domain";
import { runEnrichment } from "../enrichment/pipeline";
import type {
  EnrichmentOutcome,
  EnrichmentPlan,
  EnrichmentPorts,
  StepMeta,
  StepRunResult,
} from "../enrichment/types";
import type { EvalCase } from "./cases";

export interface CallRecord extends UsageRecord {
  agentKey: string;
}

export interface CaseRun {
  caseId: string;
  outcome: EnrichmentOutcome | null;
  plan: EnrichmentPlan | null;
  /** snapshot id → text, for quote checks. */
  snapshotText: Map<string, string>;
  calls: CallRecord[];
  wallMs: number;
  error: string | null;
}

export interface CaseBudget {
  /** Remaining USD for this case (the runner's cap minus what is spent). */
  remainingUsd: () => number;
  /** Called after each provider call with its cost. */
  onSpend: (usd: number) => void;
}

export async function runCase(
  c: EvalCase,
  gateway: AIGateway,
  budget: CaseBudget,
  now: Date = new Date("2026-11-05T12:00:00Z"),
): Promise<CaseRun> {
  const home = Object.keys(c.pages)[0] ?? c.product.website_url;
  const snapshotText = new Map<string, string>();
  const calls: CallRecord[] = [];
  let plan: EnrichmentPlan | null = null;
  let seq = 0;
  let currentAgent = "";
  const ports: EnrichmentPorts = {
    loadProduct: async () => ({
      id: c.id,
      name: c.product.name,
      website_url: home,
      company_id: `${c.id}-company`,
      primary_category_slugs: [],
      tagline: null,
      short_description: null,
      description: null,
    }),
    loadExistingClaims: async () => [],
    step: async <T>(meta: StepMeta, run: (id: string) => Promise<StepRunResult<T>>) => {
      currentAgent = meta.agentKey;
      const id = `${meta.agentKey}/${meta.stepKey}`;
      const res = await run(id);
      return { output: res.output, stepId: id, reused: false };
    },
    fetchDocument: async (url) => {
      const text = c.pages[url];
      if (text === undefined)
        return { status: "unavailable", reason: "http_404", retryable: false };
      const doc: SourceDocument = {
        source_key: "official_website",
        canonical_url: url,
        external_id: null,
        title: null,
        text,
        published_at: null,
        retrieved_at: now.toISOString(),
        content_hash: "0".repeat(64),
        fetch_status: "ok",
        http_status: 200,
        storage_permitted: "excerpt",
        metadata: { links: url === home ? c.links : [] },
      };
      return { status: "ok", data: doc };
    },
    recordSnapshot: async (doc) => {
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
      snapshotText.set(id, doc.text);
      return id;
    },
    applyPlan: async (_stepId, p) => {
      plan = p;
      return { status: "applied", evidence_count: p.evidence.length };
    },
    gateway,
    remainingAiBudgetUsd: () => Math.max(0, budget.remainingUsd()),
    recordUsage: async (_stepId, usage) => {
      calls.push({ ...usage, agentKey: currentAgent });
      // A refused call records its worst case but costs nothing.
      if (usage.outcome !== "budget_refused")
        budget.onSpend(usage.reportedCostUsd ?? usage.estimatedCostUsd ?? 0);
    },
    stopReason: () => null,
    maxPages: 5,
    maxAgeDays: 3650,
    now: () => now,
    signal: new AbortController().signal,
  };
  const started = Date.now();
  try {
    const outcome = await runEnrichment(ports);
    return {
      caseId: c.id,
      outcome,
      plan,
      snapshotText,
      calls,
      wallMs: Date.now() - started,
      error: null,
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return {
      caseId: c.id,
      outcome: null,
      plan,
      snapshotText,
      calls,
      wallMs: Date.now() - started,
      error: `${code ?? "ERROR"}: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        300,
      ),
    };
  }
}

export interface CaseScore {
  caseId: string;
  kind: EvalCase["kind"];
  completed: boolean;
  error: string | null;
  accepted: number;
  /** Accepted items whose quote is not in the cited page or whose number is not in the quote. */
  unsupported: string[];
  /** Accepted items the annotation forbids. */
  forbidden: string[];
  expectedTotal: number;
  expectedFound: number;
  missed: string[];
  exclusion: string | null;
  exclusionExpected: string;
  /** Outcome among the accepted ones (gate). */
  exclusionCorrect: boolean;
  /** Outcome equal to the expected one (reported, not gated). */
  exclusionExact: boolean;
  firstAttemptCalls: number;
  firstAttemptValid: number;
  repairs: number;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

const norm = (s: unknown) => normalizeForMatch(String(s ?? ""));
const digits = (s: string) => s.replace(/(\d)[,\s.](?=\d{3}\b)/g, "$1");

function numberInQuote(value: number, quote: string): boolean {
  const q = digits(quote);
  if (value === 0) return /\b0\b|free|gratuit/i.test(q);
  const forms = new Set([String(value), value.toFixed(2), String(Math.round(value))]);
  return [...forms].some((f) => q.includes(f) || q.includes(f.replace(".", ",")));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Annotation matcher: the needle must start a word; needles of three
 * characters or fewer ("ai", "api", "x", "a/b") must also end one, so "ai"
 * does not match "email". Longer needles may be word prefixes ("schedul").
 */
export function matchesNeedle(text: string, needle: string): boolean {
  const n = norm(needle);
  if (!n) return false;
  const end = n.length <= 3 ? "(?![a-z0-9])" : "";
  return new RegExp(`(?<![a-z0-9])${escapeRe(n)}${end}`).test(norm(text));
}

const sameName = (reported: string, any: string[]) => {
  const r = norm(reported);
  return any.some((a) => {
    const x = norm(a);
    return r === x || r.includes(x) || x.includes(r);
  });
};

/** Accepted exclusion outcomes; an excluded or under-review case never accepts eligible. */
export function acceptedExclusions(c: EvalCase): string[] {
  const accepted = c.accepted_exclusions ?? [c.expected_exclusion];
  return c.expected_exclusion === "eligible" ? accepted : accepted.filter((s) => s !== "eligible");
}

export function scoreCase(c: EvalCase, run: CaseRun): CaseScore {
  const plan = run.plan;
  const accepted = (plan?.evidence ?? []).filter((e) => e.verification_status === "verified");
  const unsupported: string[] = [];
  const forbidden: string[] = [];
  for (const e of accepted) {
    const value = e.claim_value as Record<string, unknown>;
    const quote = String(value.quote ?? "");
    const label = `${e.claim_type}:${e.claim_text.slice(0, 80)}`;
    if (!norm(run.snapshotText.get(e.source_snapshot_id)).includes(norm(quote))) {
      unsupported.push(`quote not in page — ${label}`);
      continue;
    }
    const amount = e.claim_type === "pricing" ? value.price_amount : value.value;
    if (typeof amount === "number" && !numberInQuote(amount, quote))
      unsupported.push(`number not in quote — ${label}`);
    const f = c.forbidden;
    const field = String(value.field_key ?? "");
    if (f.fields?.includes(field)) forbidden.push(`field ${field}`);
    if (e.monetization_signal && f.monetization_signals?.includes(e.monetization_signal))
      forbidden.push(`monetization ${e.monetization_signal}`);
    const blob = norm(`${e.claim_text} ${JSON.stringify(value)}`);
    for (const t of f.texts ?? [])
      if (blob.includes(norm(t))) forbidden.push(`text "${t.slice(0, 40)}"`);
  }
  const plans = plan?.pricing_plans ?? [];
  const features = plan?.features ?? [];
  const integrations = plan?.integrations ?? [];
  const fields = { ...(plan?.product_fields ?? {}), ...(plan?.company_fields ?? {}) };
  for (const field of c.forbidden.fields ?? [])
    if (field in fields && !forbidden.includes(`field ${field}`)) forbidden.push(`field ${field}`);
  for (const p of plans) {
    const name = String(p.plan_name ?? "");
    if ((c.forbidden.plan_names ?? []).some((n) => norm(n) === norm(name)))
      forbidden.push(`plan ${name}`);
    if (
      p.is_enterprise_plan === true &&
      (c.forbidden.enterprise_plans ?? []).some((n) => norm(n) === norm(name))
    )
      forbidden.push(`enterprise flag on ${name}`);
  }
  const featureTexts = features.map((f) => {
    const ev = accepted.find((e) => e.key === f.evidence_key);
    return norm(
      `${f.name} ${String((ev?.claim_value as { quote?: unknown } | undefined)?.quote ?? "")}`,
    );
  });
  for (const fa of c.forbidden.features_any ?? [])
    if (featureTexts.some((t) => matchesNeedle(t, fa))) forbidden.push(`feature "${fa}"`);

  const missed: string[] = [];
  let found = 0;
  let total = 0;
  const tally = (ok: boolean, label: string) => {
    total++;
    if (ok) found++;
    else missed.push(label);
  };
  for (const e of c.expected.plans) {
    tally(
      plans.some(
        (p) =>
          sameName(String(p.plan_name ?? ""), e.name_any) &&
          e.price_amount_any.some((a) =>
            a === null
              ? p.price_amount === null
              : typeof p.price_amount === "number" && Math.abs(p.price_amount - a) < 0.005,
          ),
      ),
      `plan ${e.name}`,
    );
  }
  for (const m of c.expected.features)
    tally(
      featureTexts.some((t) => m.any.some((a) => matchesNeedle(t, a))),
      `feature ${m.label}`,
    );
  for (const m of c.expected.integrations)
    tally(
      integrations.some((i) => m.any.some((a) => matchesNeedle(i.name, a))),
      `integration ${m.label}`,
    );
  for (const ef of c.expected.fields) {
    const got = fields[ef.field_key]?.value;
    const ok = Array.isArray(ef.value)
      ? Array.isArray(got) && ef.value.every((v) => got.map(norm).includes(norm(v)))
      : typeof ef.value === "string"
        ? norm(got) === norm(ef.value)
        : got === ef.value;
    tally(ok, `field ${ef.field_key}`);
  }
  if (c.expected.min_conflicts !== undefined)
    tally((plan?.conflicts.length ?? 0) >= c.expected.min_conflicts, "conflict recorded");
  if (c.expected.warnings_any) {
    const w = norm((run.outcome?.summary.warnings ?? []).join(" "));
    tally(
      c.expected.warnings_any.some((x) => w.includes(norm(x))),
      "warning raised",
    );
  }

  const exclusion = run.outcome?.summary.exclusion_status ?? null;
  const first = run.calls.filter((k) => k.operation === "structured_output");
  return {
    caseId: c.id,
    kind: c.kind,
    completed:
      run.error === null &&
      run.outcome !== null &&
      run.outcome.terminalReason !== "budget_exhausted",
    error: run.error,
    accepted: accepted.length,
    unsupported,
    forbidden,
    expectedTotal: total,
    expectedFound: found,
    missed,
    exclusion,
    exclusionExpected: c.expected_exclusion,
    exclusionCorrect: acceptedExclusions(c).includes(exclusion ?? ""),
    exclusionExact: exclusion === c.expected_exclusion,
    firstAttemptCalls: first.length,
    firstAttemptValid: first.filter((k) => k.outcome === "ok").length,
    repairs: run.calls.filter((k) => k.operation === "repair").length,
    costUsd: run.calls
      .filter((k) => k.outcome !== "budget_refused")
      .reduce((s, k) => s + (k.reportedCostUsd ?? k.estimatedCostUsd ?? 0), 0),
    latencyMs: run.calls.reduce((s, k) => s + (k.latencyMs ?? 0), 0),
    inputTokens: run.calls.reduce((s, k) => s + (k.inputTokens ?? 0), 0),
    outputTokens: run.calls.reduce((s, k) => s + (k.outputTokens ?? 0), 0),
  };
}

const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
};

export interface ConfigSummary {
  cases: number;
  completed: number;
  accepted: number;
  unsupportedRate: number;
  forbiddenAccepted: number;
  exclusionAccuracy: number;
  /** Share of cases whose outcome equals the expected one exactly (reported, not gated). */
  exclusionExactRate: number;
  firstAttemptValidRate: number;
  lostEnrichments: number;
  recall: number;
  costUsd: number;
  meanCostPerRealUsd: number;
  p95CostPerRealUsd: number;
  p95LatencyMs: number;
  gates: {
    unsupported: boolean;
    forbidden: boolean;
    exclusion: boolean;
    validity: boolean;
    lost: boolean;
  };
  passesGates: boolean;
}

/** Aggregates case scores with the PD-24a gates (evals/benchmark/PLAN.md). */
export function summarize(scores: CaseScore[]): ConfigSummary {
  const accepted = scores.reduce((s, x) => s + x.accepted, 0);
  const unsupported = scores.reduce((s, x) => s + x.unsupported.length, 0);
  const forbiddenAccepted = scores.reduce((s, x) => s + x.forbidden.length, 0);
  const firstCalls = scores.reduce((s, x) => s + x.firstAttemptCalls, 0);
  const firstValid = scores.reduce((s, x) => s + x.firstAttemptValid, 0);
  const lost = scores.filter((x) => x.error !== null).length;
  const real = scores.filter((x) => x.kind === "real" && x.completed);
  const total = scores.reduce((s, x) => s + x.expectedTotal, 0);
  const found = scores.reduce((s, x) => s + x.expectedFound, 0);
  const unsupportedRate = accepted === 0 ? 0 : unsupported / accepted;
  const exclusionAccuracy =
    scores.length === 0 ? 0 : scores.filter((x) => x.exclusionCorrect).length / scores.length;
  const firstAttemptValidRate = firstCalls === 0 ? 1 : firstValid / firstCalls;
  const gates = {
    unsupported: unsupportedRate <= 0.01,
    forbidden: forbiddenAccepted === 0,
    exclusion: exclusionAccuracy === 1,
    validity: firstAttemptValidRate >= 0.95,
    lost: lost === 0,
  };
  return {
    cases: scores.length,
    completed: scores.filter((x) => x.completed).length,
    accepted,
    unsupportedRate,
    forbiddenAccepted,
    exclusionAccuracy,
    exclusionExactRate:
      scores.length === 0 ? 0 : scores.filter((x) => x.exclusionExact).length / scores.length,
    firstAttemptValidRate,
    lostEnrichments: lost,
    recall: total === 0 ? 1 : found / total,
    costUsd: scores.reduce((s, x) => s + x.costUsd, 0),
    meanCostPerRealUsd:
      real.length === 0 ? 0 : real.reduce((s, x) => s + x.costUsd, 0) / real.length,
    p95CostPerRealUsd: quantile(
      real.map((x) => x.costUsd),
      0.95,
    ),
    p95LatencyMs: quantile(
      scores.map((x) => x.latencyMs),
      0.95,
    ),
    gates,
    passesGates: Object.values(gates).every(Boolean),
  };
}
