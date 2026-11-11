// Evaluation of the Pain Point Engine on fixed fixtures (CLAUDE.md §13,
// Implementation Blueprint §14: clustering purity / incorrect-merge rate,
// author counting, relative frequency). Runs the real pipeline on in-memory
// ports with any gateway; thresholds per agent come from PD-22.
import type { AIGateway } from "@sor/ai-gateway";
import type { QualityEvidence } from "@sor/domain";
import { memoryPorts } from "./memory";
import { runPainPointRun } from "./pipeline";
import type { FeedbackItem } from "./types";

export interface PainFixture {
  id: string;
  label: string;
  products: Array<{ id: string; name: string; total_known_review_count: number | null }>;
  feedback: Array<{
    id: string;
    product_id: string;
    author: string | null;
    company?: string | null;
    text: string;
    published_at?: string | null;
  }>;
  expected: {
    same_cluster: string[][];
    different_clusters: string[][];
    cluster_checks?: Array<{
      feedback_id: string;
      feedback_count?: number;
      distinct_author_count?: number | null;
      distinct_author_count_status?: string;
      relative_frequency?: Record<string, number | null>;
    }>;
  };
}

export interface PainFixtureScore {
  id: string;
  groupsExpected: number;
  groupsTogether: number;
  pairsExpectedApart: number;
  pairsMerged: number;
  checks: number;
  checksPassed: number;
  failures: string[];
  clusters: number;
}

const evidence = (sourceRecordId: string): QualityEvidence => ({
  sourceRecordId,
  reliabilityLevel: 4,
  verificationStatus: "unverified",
  datedAt: "2026-10-01T00:00:00Z",
  inOpenConflict: false,
});

export async function evaluatePainFixture(
  fixture: PainFixture,
  gateway: AIGateway,
): Promise<PainFixtureScore> {
  const feedback: FeedbackItem[] = fixture.feedback.map((f, i) => ({
    id: f.id,
    productId: f.product_id,
    text: f.text,
    publishedAt: f.published_at ?? `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    authorReferenceHash: f.author,
    authorCompanyReference: f.company ?? null,
    isNearDuplicateOf: null,
    evidenceId: `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`,
    evidence: evidence(`source-${fixture.id}`),
  }));
  const { ports, store } = memoryPorts({
    run: {
      id: `00000000-0000-4000-8000-${fixture.id.length.toString().padStart(12, "0")}`,
      workspaceId: "eval",
      title: fixture.label,
      maxFeedbackItems: 500,
      products: fixture.products.map((p) => ({
        id: p.id,
        name: p.name,
        visible: true,
        totalKnownReviewCount: p.total_known_review_count,
      })),
    },
    feedback,
    gateway,
  });
  await runPainPointRun(ports);

  // Feedback → its primary problem → the cluster holding it (active membership).
  const clusterOfFeedback = new Map<string, string>();
  for (const [feedbackId, entry] of store.problems) {
    const primary = entry.problems.find((p) => p.is_primary) ?? entry.problems[0];
    if (!primary) continue;
    for (const c of store.clusters.values())
      if (c.members.some((m) => m.problem_id === primary.id && !m.removed))
        clusterOfFeedback.set(feedbackId, c.id);
  }
  const failures: string[] = [];
  let together = 0;
  for (const group of fixture.expected.same_cluster) {
    const ids = new Set(group.map((f) => clusterOfFeedback.get(f) ?? `none:${f}`));
    if (ids.size === 1 && ![...ids][0]?.startsWith("none:")) together++;
    else
      failures.push(`not grouped: ${group.length} feedback items spread over ${ids.size} groups`);
  }
  let merged = 0;
  for (const [a, b] of fixture.expected.different_clusters) {
    const ca = clusterOfFeedback.get(a as string);
    if (ca && ca === clusterOfFeedback.get(b as string)) {
      merged++;
      failures.push(`incorrect merge: ${a} and ${b}`);
    }
  }
  let checksPassed = 0;
  const checks = fixture.expected.cluster_checks ?? [];
  for (const check of checks) {
    const cluster = store.clusters.get(clusterOfFeedback.get(check.feedback_id) ?? "");
    const s = cluster?.stats as Record<string, unknown> | undefined;
    const problems: string[] = [];
    if (!s) problems.push("no cluster");
    else {
      if (check.feedback_count !== undefined && s.feedback_count !== check.feedback_count)
        problems.push(`feedback_count ${String(s.feedback_count)} ≠ ${check.feedback_count}`);
      if (
        check.distinct_author_count !== undefined &&
        s.distinct_author_count !== check.distinct_author_count
      )
        problems.push(
          `distinct_author_count ${String(s.distinct_author_count)} ≠ ${String(check.distinct_author_count)}`,
        );
      if (
        check.distinct_author_count_status &&
        s.distinct_author_count_status !== check.distinct_author_count_status
      )
        problems.push(`author status ${String(s.distinct_author_count_status)}`);
      for (const [product, rf] of Object.entries(check.relative_frequency ?? {})) {
        const got = (
          s.product_distribution as Array<{ product_id: string; relative_frequency: number | null }>
        ).find((p) => p.product_id === product)?.relative_frequency;
        if (got !== rf)
          problems.push(`relative_frequency ${product}: ${String(got)} ≠ ${String(rf)}`);
      }
    }
    if (problems.length === 0) checksPassed++;
    else failures.push(...problems.map((p) => `check ${check.feedback_id}: ${p}`));
  }
  return {
    id: fixture.id,
    groupsExpected: fixture.expected.same_cluster.length,
    groupsTogether: together,
    pairsExpectedApart: fixture.expected.different_clusters.length,
    pairsMerged: merged,
    checks: checks.length,
    checksPassed,
    failures,
    clusters: store.clusters.size,
  };
}

export async function evaluatePainFixtures(fixtures: PainFixture[], gateway: AIGateway) {
  const scores: PainFixtureScore[] = [];
  for (const f of fixtures) scores.push(await evaluatePainFixture(f, gateway));
  const sum = (k: keyof PainFixtureScore) => scores.reduce((s, x) => s + (x[k] as number), 0);
  return {
    scores,
    groupingRecall: sum("groupsExpected") === 0 ? 1 : sum("groupsTogether") / sum("groupsExpected"),
    incorrectMergeRate:
      sum("pairsExpectedApart") === 0 ? 0 : sum("pairsMerged") / sum("pairsExpectedApart"),
    countingAccuracy: sum("checks") === 0 ? 1 : sum("checksPassed") / sum("checks"),
  };
}
