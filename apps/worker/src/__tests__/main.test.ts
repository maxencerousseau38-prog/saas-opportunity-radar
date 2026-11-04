import { describe, expect, it } from "vitest";
import { EnvValidationError } from "@sor/contracts/env";
import { main } from "../main";

const SECRET = "sb_secret_0123456789abcdefghij";

describe("worker main", () => {
  it("starts with a valid environment and never logs the secret", () => {
    const entries: Record<string, unknown>[] = [];
    const code = main(
      { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: SECRET, WORKER_ID: "worker-1" },
      (entry) => entries.push(entry),
    );
    expect(code).toBe(0);
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain(SECRET);
  });

  it("refuses to start with an invalid environment", () => {
    expect(() => main({ SUPABASE_URL: "not-a-url" }, () => undefined)).toThrow(EnvValidationError);
  });
});
