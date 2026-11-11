// Token prices and cost arithmetic (USD per million tokens). Prices are
// configuration, verified against the vendors' official pages
// (evals/benchmark/pricing.json); the code never hard-codes them.

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Price of cached prompt tokens read (defaults to the input price). */
  cacheReadPerMTok?: number;
  /** Price of prompt tokens written to the cache (defaults to the input price). */
  cacheWritePerMTok?: number;
  /** Higher prices for the whole request above a prompt size (e.g. Claude Haiku 5.5 > 100K). */
  longContext?: { thresholdTokens: number; inputPerMTok: number; outputPerMTok: number };
}

export interface TokenCounts {
  /** Uncached prompt tokens. */
  inputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Output tokens, reasoning included. */
  outputTokens: number;
}

function tier(pricing: ModelPricing, promptTokens: number) {
  const long = pricing.longContext;
  if (long && promptTokens > long.thresholdTokens) {
    const ratio = long.inputPerMTok / pricing.inputPerMTok;
    return {
      input: long.inputPerMTok,
      output: long.outputPerMTok,
      cacheRead: (pricing.cacheReadPerMTok ?? pricing.inputPerMTok) * ratio,
      cacheWrite: (pricing.cacheWritePerMTok ?? pricing.inputPerMTok) * ratio,
    };
  }
  return {
    input: pricing.inputPerMTok,
    output: pricing.outputPerMTok,
    cacheRead: pricing.cacheReadPerMTok ?? pricing.inputPerMTok,
    cacheWrite: pricing.cacheWritePerMTok ?? pricing.inputPerMTok,
  };
}

export function costUsd(pricing: ModelPricing, t: TokenCounts): number {
  const prompt = t.inputTokens + (t.cacheReadTokens ?? 0) + (t.cacheWriteTokens ?? 0);
  const p = tier(pricing, prompt);
  return (
    (t.inputTokens * p.input +
      (t.cacheReadTokens ?? 0) * p.cacheRead +
      (t.cacheWriteTokens ?? 0) * p.cacheWrite +
      t.outputTokens * p.output) /
    1_000_000
  );
}

/**
 * Worst case of one call, used to refuse calls that could exceed a budget:
 * prompt counted at one token per two characters (no tokenizer produces more
 * on text) plus a fixed allowance for vendor-injected instructions, output at
 * the cap, no cache discount.
 */
export function worstCaseCostUsd(
  pricing: ModelPricing,
  promptChars: number,
  maxOutputTokens: number,
): number {
  const promptTokens = Math.ceil(promptChars / 2) + 2_000;
  return costUsd(pricing, { inputTokens: promptTokens, outputTokens: maxOutputTokens });
}
