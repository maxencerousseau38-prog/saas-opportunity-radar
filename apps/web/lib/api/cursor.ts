// Opaque, HMAC-signed pagination cursors (Implementation Blueprint §10
// "Conventions"). The cursor binds the sort key value, the row id, the sort,
// the random seed and a hash of the query, so it cannot be replayed on
// another query. Key derived from the server secret (never sent to browsers).
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export interface CursorPayload {
  v: string; // sort value as exact text
  id: string;
  sort: string;
  seed: number;
  q: string; // query hash
  at?: string; // feed session start (PD-41): the session's ranking is frozen at it
}

function key(): Buffer {
  return createHmac("sha256", getServerEnv().SUPABASE_SECRET_KEY).update("sor-cursor-v1").digest();
}

export function queryHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url").slice(0, 22);
}

export function encodeCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns null for a tampered, malformed or foreign cursor. */
export function decodeCursor(cursor: string): CursorPayload | null {
  const [body, sig] = cursor.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<CursorPayload>;
    if (
      typeof p.v !== "string" ||
      typeof p.id !== "string" ||
      typeof p.sort !== "string" ||
      typeof p.seed !== "number" ||
      typeof p.q !== "string" ||
      (p.at !== undefined && typeof p.at !== "string")
    ) {
      return null;
    }
    return p as CursorPayload;
  } catch {
    return null;
  }
}
