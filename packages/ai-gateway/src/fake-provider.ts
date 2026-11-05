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
      dimensions: FAKE_EMBEDDING_DIMENSIONS,
      vectors: texts.map(fakeEmbedding),
      usage: { inputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
    };
  }
}

export const FAKE_EMBEDDING_DIMENSIONS = 64;
const STOPWORDS = new Set(
  "a an the and or but of to in on for with at by from is are was were be been it its this that i we you they my our your their not no very too so just can cannot".split(
    " ",
  ),
);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

/**
 * Deterministic stand-in for an embedding model: signed feature hashing of
 * stemmed content words, L2-normalised. Texts sharing words are close; it
 * knows no synonyms, so it is a baseline, not a semantic model (PD-24b).
 */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(FAKE_EMBEDDING_DIMENSIONS).fill(0);
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    const idx = (h >>> 0) % FAKE_EMBEDDING_DIMENSIONS;
    v[idx] = (v[idx] ?? 0) + ((h >>> 31) & 1 ? -1 : 1);
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
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
