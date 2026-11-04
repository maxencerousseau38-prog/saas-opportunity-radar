// Implementation Blueprint §4.0: pins the Zod behaviours the contracts rely on,
// so that a Zod upgrade cannot silently change them.
import { describe, expect, it } from "vitest";
import { z } from "zod";

const Inner = z.object({ mode: z.string().default("deep") }).strict();

describe("object defaults", () => {
  it("convention: a factory returning a parsed value applies inner defaults", () => {
    const Outer = z.object({ inner: Inner.default(() => Inner.parse({})) }).strict();
    expect(Outer.parse({}).inner.mode).toBe("deep");
  });

  it("documents why: `.default({})` returns the default as-is, without inner defaults", () => {
    const Outer = z.object({ inner: Inner.default({} as z.infer<typeof Inner>) });
    expect(Outer.parse({}).inner.mode).toBeUndefined();
  });
});

describe("records keyed by an enum", () => {
  const Key = z.enum(["a", "b"]);

  it("documents why they are avoided: z.record(enum) requires every key", () => {
    expect(z.record(Key, z.number()).safeParse({ a: 1 }).success).toBe(false);
  });

  it("an explicit object with optional keys accepts a partial value", () => {
    const Partial = z.object({ a: z.number().optional(), b: z.number().optional() }).strict();
    expect(Partial.safeParse({ a: 1 }).success).toBe(true);
  });
});

describe("strict objects", () => {
  it("reject unknown keys", () => {
    expect(z.object({ a: z.string() }).strict().safeParse({ a: "x", b: 1 }).success).toBe(false);
  });
});

describe("URLs", () => {
  it("documents why HttpUrlSchema exists: plain .url() accepts a javascript: URL", () => {
    expect(z.string().url().safeParse("javascript:alert(1)").success).toBe(true);
  });
});

describe("coercion", () => {
  it("documents why CSV helpers exist: z.coerce.number() turns an empty cell into 0", () => {
    expect(z.coerce.number().parse("")).toBe(0);
  });
});
