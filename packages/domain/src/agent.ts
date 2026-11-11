// Agent contract (Implementation Blueprint §5.5) — types only.
import type { Budget } from "./jobs";

export interface AgentContext {
  jobExecutionId: string;
  workspaceId?: string;
  traceId: string;
  abortSignal: AbortSignal;
  budget: Budget;
}

export interface AgentResult<T> {
  output: T;
  evidenceIds: string[];
  warnings: string[];
  model?: {
    provider: string;
    name: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

export interface Agent<I, O> {
  readonly key: string;
  readonly contractVersion: string;
  readonly promptVersion: string | null; // null for deterministic agents
  run(input: I, context: AgentContext): Promise<AgentResult<O>>;
}
