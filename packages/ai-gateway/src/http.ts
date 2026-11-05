// JSON over HTTPS for the provider adapters: bounded retries on rate limits
// and transient server errors, abort-aware, never logs headers or bodies.
import { ProviderError } from "./provider";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export interface PostOptions {
  fetch?: FetchLike;
  signal: AbortSignal;
  /** Attempts in total (default 3). */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: PostOptions,
): Promise<unknown> {
  const doFetch = options.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? ((ms: number) => wait(ms, options.signal));
  let lastError = "no attempt";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err) {
      if (options.signal.aborted) throw err;
      lastError = "network error";
      if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new ProviderError("invalid JSON response", true);
      }
    }
    // Error bodies are vendor messages without secrets; keep a short excerpt for diagnosis.
    const excerpt = (await res.text().catch(() => "")).slice(0, 300);
    lastError = `http_${res.status}: ${excerpt}`;
    if (!RETRYABLE.has(res.status)) throw new ProviderError(lastError, false);
    if (attempt < attempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 30) * 1000
          : 1000 * 2 ** attempt;
      await sleep(delay);
    }
  }
  throw new ProviderError(lastError, true);
}

/** Parses a model's JSON text; a non-JSON answer becomes `null` (the gateway then repairs). */
export function parseModelJson(text: string | null | undefined): unknown {
  if (!text) return null;
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
