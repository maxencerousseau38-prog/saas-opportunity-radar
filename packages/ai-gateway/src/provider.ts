// AI provider contract (Implementation Blueprint §5.3; ADR-006).

export type ModelProfile =
  "fast_extraction" | "classification" | "research" | "reasoning" | "verification" | "embedding";

export interface UntrustedInput {
  label: string;
  ref: string;
  text: string;
}

export interface StructuredAIRequest<TSchema> {
  agentKey: string;
  contractVersion: string;
  promptVersion: string;
  /** States that untrusted inputs are data, never instructions. */
  systemInstructions: string;
  untrustedInputs: UntrustedInput[];
  trustedInput: unknown;
  schema: TSchema;
  modelProfile: Exclude<ModelProfile, "embedding">;
  maxOutputTokens: number;
  timeoutMs: number;
  maxCostUsd: number;
  temperature?: number;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  reportedCostUsd?: number;
  latencyMs: number;
}

export interface StructuredAIResult<T> {
  data: T;
  provider: string;
  model: string;
  usage: AIUsage;
  finishReason: "stop" | "length" | "unknown";
  repaired: boolean;
}

export interface EmbeddingResult {
  provider: string;
  model: string;
  dimensions: number;
  vectors: number[][];
  usage: AIUsage;
}

/** What the gateway sends to a provider (one call). */
export interface ProviderCall {
  request: StructuredAIRequest<unknown>;
  model: string;
  /** Present on the single repair call: the validation problems of the first answer. */
  repair?: { previousOutput: unknown; problems: string[] };
  signal: AbortSignal;
}

export interface ProviderResponse {
  /** Raw parsed JSON produced by the model (validated by the gateway, not the provider). */
  output: unknown;
  usage: AIUsage;
  finishReason: "stop" | "length" | "unknown";
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}

export interface AIProvider {
  readonly id: string;
  /** Worst-case cost of a call, used to refuse calls that could exceed the budget. */
  estimateMaxCostUsd(call: Omit<ProviderCall, "signal">): number;
  generate(call: ProviderCall): Promise<ProviderResponse>;
  embed(texts: string[], model: string, signal: AbortSignal): Promise<EmbeddingResult>;
}
