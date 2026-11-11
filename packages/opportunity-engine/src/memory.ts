// In-memory ports of the opportunity_analysis pipeline, for unit tests and
// the evaluation runner (no database). Mirrors the database semantics that
// matter: the evidence index accepts only scope evidence, keyed steps are
// reused, the final write recomputes nothing but is stored atomically.
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import type {
  AnalysisContext,
  CandidateEvidence,
  CustomerVoiceData,
  FinalResult,
  OpportunityPorts,
} from "./types";

export interface OpportunityMemoryStore {
  index: Set<string>;
  final: FinalResult | null;
  needsReview: Array<Record<string, unknown>> | null;
  steps: Map<string, { inputHash: string; output: unknown }>;
  usage: UsageRecord[];
  modelCalls: number;
  customerVoiceCalls: number;
}

export function opportunityMemoryStore(): OpportunityMemoryStore {
  return {
    index: new Set(),
    final: null,
    needsReview: null,
    steps: new Map(),
    usage: [],
    modelCalls: 0,
    customerVoiceCalls: 0,
  };
}

export function opportunityMemoryPorts(options: {
  analysis: AnalysisContext;
  evidence: CandidateEvidence[];
  voice?: CustomerVoiceData;
  gateway: AIGateway;
  store?: OpportunityMemoryStore;
  budgetUsd?: number;
  stop?: () => "cancelled" | "budget" | null;
  now?: Date;
}): { ports: OpportunityPorts; store: OpportunityMemoryStore } {
  const store = options.store ?? opportunityMemoryStore();
  const visible = new Set(options.analysis.scope.filter((p) => p.visible).map((p) => p.id));
  const inScope = (e: CandidateEvidence) => e.productId === null || visible.has(e.productId);
  let spent = 0;
  const ports: OpportunityPorts = {
    loadAnalysis: async () => options.analysis,
    loadCandidateEvidence: async () => options.evidence.filter(inScope),
    addToIndex: async (_stepId, ids) => {
      for (const id of ids) {
        const e = options.evidence.find((x) => x.evidenceId === id);
        if (!e || !inScope(e)) throw new Error("EVIDENCE_SCOPE_VIOLATION");
        store.index.add(id);
      }
    },
    customerVoice: async () => {
      store.customerVoiceCalls++;
      return (
        options.voice ?? {
          runId: null,
          reusedRun: false,
          clusters: [],
          relevantSourceCount: 0,
          distinctAuthorCount: null,
          limitations: [],
        }
      );
    },
    loadEvidence: async (ids) => options.evidence.filter((e) => ids.includes(e.evidenceId)),
    finalize: async (result) => {
      for (const id of JSON.stringify(result.report).match(/"evidence_id":"([^"]+)"/g) ?? []) {
        const value = id.slice('"evidence_id":"'.length, -1);
        if (!store.index.has(value)) throw new Error("EVIDENCE_SCOPE_VIOLATION");
      }
      store.final = result;
    },
    markNeedsReview: async (limitations) => {
      store.needsReview = limitations;
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
