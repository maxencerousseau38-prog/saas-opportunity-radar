// Fake provider for tests and local development (ADR-006, PD-08 A). It is
// clearly labelled ("fake") in every recorded step and costs nothing. Agents
// register deterministic handlers; there is no real model behind it.
import type { AIProvider, EmbeddingResult, ProviderCall, ProviderResponse } from "./provider";

export type FakeHandler = (call: ProviderCall) => unknown | Promise<unknown>;

export class FakeProvider implements AIProvider {
  readonly id = "fake";
  readonly calls: Array<{ agentKey: string; repair: boolean }> = [];

  constructor(private readonly handlers: Record<string, FakeHandler>) {}

  estimateMaxCostUsd(): number {
    return 0;
  }

  async generate(call: ProviderCall): Promise<ProviderResponse> {
    this.calls.push({ agentKey: call.request.agentKey, repair: Boolean(call.repair) });
    const handler = this.handlers[call.request.agentKey];
    if (!handler) throw new Error(`fake provider: no handler for ${call.request.agentKey}`);
    const output = await handler(call);
    return {
      output,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
      finishReason: "stop",
    };
  }

  async embed(texts: string[], model: string): Promise<EmbeddingResult> {
    return {
      provider: this.id,
      model,
      dimensions: 3,
      vectors: texts.map(() => [0, 0, 0]),
      usage: { latencyMs: 0 },
    };
  }
}

/** Profiles of the fake provider. PD-24 decides the real provider and models. */
export const FAKE_MODELS = {
  fast_extraction: "fake-extraction-1",
  classification: "fake-classification-1",
  research: "fake-research-1",
  reasoning: "fake-reasoning-1",
  verification: "fake-verification-1",
  embedding: "fake-embedding-1",
} as const;
