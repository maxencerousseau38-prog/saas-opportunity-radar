import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_0123456789";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_key_0123456789abcdef";
});

describe("pagination cursor", () => {
  it("round-trips and keeps the exact sort value", async () => {
    const { decodeCursor, encodeCursor } = await import("@/lib/api/cursor");
    const payload = {
      v: "1234567890123.123456789",
      id: "00000000-0000-4000-8000-000000000001",
      sort: "relevance",
      seed: 7,
      q: "abc",
    };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("carries the feed session start (PD-41) and still reads older cursors", async () => {
    const { decodeCursor, encodeCursor } = await import("@/lib/api/cursor");
    const payload = {
      v: "1.234567890123",
      id: "00000000-0000-4000-8000-000000000002",
      sort: "discovery",
      seed: 9,
      q: "abc",
      at: "2026-11-13T12:00:00.000Z",
    };
    expect(decodeCursor(encodeCursor(payload))?.at).toBe(payload.at);
    const older = { ...payload } as Partial<typeof payload>;
    delete older.at;
    expect(decodeCursor(encodeCursor(older as Parameters<typeof encodeCursor>[0]))).toEqual(older);
  });

  it("rejects a tampered cursor", async () => {
    const { decodeCursor, encodeCursor } = await import("@/lib/api/cursor");
    const cursor = encodeCursor({ v: "-Infinity", id: "x", sort: "newest", seed: 0, q: "q" });
    const [body, sig] = cursor.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: "9", id: "x", sort: "newest", seed: 0, q: "q" }),
    ).toString("base64url");
    expect(decodeCursor(`${forged}.${sig}`)).toBeNull();
    expect(decodeCursor(`${body}.AAAA`)).toBeNull();
    expect(decodeCursor("garbage")).toBeNull();
  });

  it("binds the query hash to the filters and sort", async () => {
    const { queryHash } = await import("@/lib/api/cursor");
    expect(queryHash({ a: 1 })).toBe(queryHash({ a: 1 }));
    expect(queryHash({ a: 1 })).not.toBe(queryHash({ a: 2 }));
  });
});
