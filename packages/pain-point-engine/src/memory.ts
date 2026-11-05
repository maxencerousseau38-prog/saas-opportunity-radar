// In-memory ports of the pain_point_run pipeline, for unit tests and the
// evaluation runner (no database). Mirrors the database semantics that matter:
// problems reused per extractor version, idempotent writes, keyed steps.
import { randomUUID } from "node:crypto";
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import type { ExtractedProblem } from "@sor/contracts";
import type {
  ClusterRecord,
  FeedbackItem,
  GapRecord,
  OpportunityRecord,
  PainPorts,
  RunContext,
  RunPatch,
  StoredProblem,
} from "./types";

export interface MemoryStore {
  problems: Map<string, { version: string; problems: StoredProblem[] }>;
  embeddings: Map<string, number[]>;
  clusters: Map<string, ClusterRecord>;
  gaps: Map<string, GapRecord>;
  opportunities: Map<string, OpportunityRecord>;
  duplicates: Map<string, string>;
  run: RunPatch;
  steps: Map<string, { inputHash: string; output: unknown }>;
  usage: UsageRecord[];
  modelCalls: number;
}

export function memoryStore(): MemoryStore {
  return {
    problems: new Map(),
    embeddings: new Map(),
    clusters: new Map(),
    gaps: new Map(),
    opportunities: new Map(),
    duplicates: new Map(),
    run: {},
    steps: new Map(),
    usage: [],
    modelCalls: 0,
  };
}

export function memoryPorts(options: {
  run: RunContext;
  feedback: FeedbackItem[];
  gateway: AIGateway;
  store?: MemoryStore;
  budgetUsd?: number;
  stop?: () => "cancelled" | "budget" | null;
  now?: Date;
}): { ports: PainPorts; store: MemoryStore } {
  const store = options.store ?? memoryStore();
  let spent = 0;
  const ports: PainPorts = {
    loadRun: async () => options.run,
    loadFeedback: async (productIds, limit) =>
      options.feedback
        .filter((f) => productIds.includes(f.productId))
        .map((f) => ({
          ...f,
          isNearDuplicateOf: f.isNearDuplicateOf ?? store.duplicates.get(f.id) ?? null,
        }))
        .sort(
          (a, b) =>
            (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || (a.id < b.id ? -1 : 1),
        )
        .slice(0, limit),
    markDuplicates: async (pairs) => {
      for (const p of pairs)
        if (!store.duplicates.has(p.feedback_id))
          store.duplicates.set(p.feedback_id, p.duplicate_of);
    },
    existingProblems: async (feedbackId, contract, prompt) => {
      const hit = store.problems.get(feedbackId);
      return hit && hit.version === `${contract}/${prompt}` ? hit.problems : null;
    },
    saveProblems: async (feedbackId, _stepId, contract, prompt, problems: ExtractedProblem[]) => {
      const existing = store.problems.get(feedbackId);
      if (existing && existing.version === `${contract}/${prompt}`) return existing.problems;
      const productId = options.feedback.find((f) => f.id === feedbackId)?.productId as string;
      const saved = problems.map((p) => ({ ...p, id: randomUUID(), feedbackId, productId }));
      store.problems.set(feedbackId, { version: `${contract}/${prompt}`, problems: saved });
      return saved;
    },
    loadEmbeddings: async (ids) =>
      new Map(
        ids
          .filter((id) => store.embeddings.has(id))
          .map((id) => [id, store.embeddings.get(id) as number[]]),
      ),
    saveEmbeddings: async (rows) => {
      for (const r of rows)
        if (!store.embeddings.has(r.problem_id)) store.embeddings.set(r.problem_id, r.vector);
    },
    saveClusters: async (clusters) => {
      for (const c of clusters) if (!store.clusters.has(c.id)) store.clusters.set(c.id, c);
    },
    saveInsights: async (gaps, opportunities) => {
      for (const g of gaps) if (!store.gaps.has(g.id)) store.gaps.set(g.id, g);
      for (const o of opportunities)
        if (!store.opportunities.has(o.id)) store.opportunities.set(o.id, o);
    },
    updateRun: async (patch) => {
      store.run = { ...store.run, ...patch };
    },
    step: async (meta, run) => {
      const key = `${meta.agentKey}/${meta.stepKey}`;
      const done = store.steps.get(key);
      if (done && done.inputHash === meta.inputHash)
        return { output: done.output as never, stepId: key, reused: true };
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
    now: () => options.now ?? new Date("2026-11-05T12:00:00Z"),
    signal: new AbortController().signal,
  };
  return { ports, store };
}
