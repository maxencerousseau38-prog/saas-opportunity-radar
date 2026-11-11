// Evaluation runner of D5/D6 on the fixed fixtures of evals/enrichment
// (PD-08 benchmark → PD-24; thresholds per agent → PD-22). Runs the real
// pipeline over in-memory ports with any AI gateway.
import type { SourceDocument } from "@sor/contracts";
import type { AIGateway } from "@sor/ai-gateway";
import { normalizeForMatch } from "@sor/domain";
import { runEnrichment } from "../enrichment/pipeline";
import type { EnrichmentPlan, EnrichmentPorts, StepMeta, StepRunResult } from "../enrichment/types";

export interface EnrichmentFixture {
  id: string;
  label: string;
  pages: Record<string, string>;
  links: string[];
  core_texts?: { tagline?: string };
  expected: { pricing: Array<[string, number]>; features: string[] };
  forbidden: { fields?: string[]; texts?: string[]; monetization_signals?: string[] };
  expected_exclusion: "eligible" | "needs_review" | "excluded";
}

export interface FixtureScore {
  id: string;
  acceptedItems: number;
  unsupportedAccepted: number;
  forbiddenAccepted: number;
  expectedFound: number;
  expectedTotal: number;
  exclusion: string | null;
  exclusionCorrect: boolean;
}

export async function evaluateFixture(
  fixture: EnrichmentFixture,
  gateway: AIGateway,
): Promise<FixtureScore> {
  const home = Object.keys(fixture.pages)[0] as string;
  const snapshotText = new Map<string, string>();
  const steps = new Map<string, unknown>();
  let plan: EnrichmentPlan | null = null;
  let seq = 0;
  const ports: EnrichmentPorts = {
    loadProduct: async () => ({
      id: "fixture",
      name: fixture.label,
      website_url: home,
      company_id: "fixture-company",
      primary_category_slugs: [],
      tagline: fixture.core_texts?.tagline ?? null,
      short_description: null,
      description: null,
    }),
    loadExistingClaims: async () => [],
    step: async <T>(meta: StepMeta, run: (id: string) => Promise<StepRunResult<T>>) => {
      const res = await run(`${meta.agentKey}/${meta.stepKey}`);
      steps.set(`${meta.agentKey}/${meta.stepKey}`, res.output);
      return { output: res.output, stepId: `${meta.agentKey}/${meta.stepKey}`, reused: false };
    },
    fetchDocument: async (url) => {
      const text = fixture.pages[url];
      if (text === undefined)
        return { status: "unavailable", reason: "http_404", retryable: false };
      const doc: SourceDocument = {
        source_key: "official_website",
        canonical_url: url,
        external_id: null,
        title: fixture.label,
        text,
        published_at: null,
        retrieved_at: new Date().toISOString(),
        content_hash: "0".repeat(64),
        fetch_status: "ok",
        http_status: 200,
        storage_permitted: "excerpt",
        metadata: { links: url === home ? fixture.links : [] },
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
    remainingAiBudgetUsd: () => Number.POSITIVE_INFINITY,
    recordUsage: async () => undefined,
    stopReason: () => null,
    maxPages: 5,
    maxAgeDays: 365,
    now: () => new Date(),
    signal: new AbortController().signal,
  };
  const outcome = await runEnrichment(ports);
  const p = plan as EnrichmentPlan | null;
  const accepted = (p?.evidence ?? []).filter((e) => e.verification_status === "verified");
  const quoteOf = (e: (typeof accepted)[number]) =>
    String((e.claim_value as { quote?: unknown }).quote ?? "");
  const unsupported = accepted.filter(
    (e) =>
      !normalizeForMatch(snapshotText.get(e.source_snapshot_id) ?? "").includes(
        normalizeForMatch(quoteOf(e)),
      ),
  );
  const forbidden = accepted.filter((e) => {
    const field = String((e.claim_value as { field_key?: unknown }).field_key ?? "");
    if (fixture.forbidden.fields?.includes(field)) return true;
    if (
      e.monetization_signal &&
      fixture.forbidden.monetization_signals?.includes(e.monetization_signal)
    )
      return true;
    return (fixture.forbidden.texts ?? []).some((t) => JSON.stringify(e).includes(t));
  });
  const pricing = (p?.pricing_plans ?? []).map(
    (pl) => [pl.plan_name, pl.price_amount] as [unknown, unknown],
  );
  const features = (p?.features ?? []).map((f) => f.name);
  const expectedFound =
    fixture.expected.pricing.filter(([name, amount]) =>
      pricing.some(([n, a]) => n === name && a === amount),
    ).length + fixture.expected.features.filter((f) => features.includes(f)).length;
  return {
    id: fixture.id,
    acceptedItems: accepted.length,
    unsupportedAccepted: unsupported.length,
    forbiddenAccepted: forbidden.length,
    expectedFound,
    expectedTotal: fixture.expected.pricing.length + fixture.expected.features.length,
    exclusion: outcome.summary.exclusion_status,
    exclusionCorrect: outcome.summary.exclusion_status === fixture.expected_exclusion,
  };
}

export async function evaluateAll(fixtures: EnrichmentFixture[], gateway: AIGateway) {
  const scores: FixtureScore[] = [];
  for (const f of fixtures) scores.push(await evaluateFixture(f, gateway));
  const accepted = scores.reduce((s, x) => s + x.acceptedItems, 0);
  const unsupported = scores.reduce((s, x) => s + x.unsupportedAccepted + x.forbiddenAccepted, 0);
  const found = scores.reduce((s, x) => s + x.expectedFound, 0);
  const total = scores.reduce((s, x) => s + x.expectedTotal, 0);
  return {
    scores,
    unsupportedClaimRate: accepted === 0 ? 0 : unsupported / accepted,
    recall: total === 0 ? 1 : found / total,
    exclusionAccuracy: scores.filter((s) => s.exclusionCorrect).length / scores.length,
  };
}
