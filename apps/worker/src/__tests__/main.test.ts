import { describe, expect, it } from "vitest";
import { EnvValidationError } from "@sor/contracts/env";
import type { DbClient } from "@sor/database";
import { buildWorker } from "../main";

const SECRET = "sb_secret_0123456789abcdefghij";
const SALT = "a-test-salt-of-at-least-thirty-two-chars";
const env = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SECRET_KEY: SECRET,
  WORKER_ID: "worker-1",
  AUTHOR_HASH_SECRET: SALT,
};

const limitsDb = {
  from: () => ({
    select: async () => ({ data: [{ key: "job_lease_seconds", value: 90 }], error: null }),
  }),
} as unknown as DbClient;

describe("worker bootstrap", () => {
  it("builds the worker with the fake provider and never logs secrets", async () => {
    const entries: Record<string, unknown>[] = [];
    const { config } = await buildWorker(env, (e) => entries.push(e), limitsDb);
    expect(config.AI_PROVIDER).toBe("fake");
    expect(entries[0]).toMatchObject({ msg: "worker configured", ai_provider: "fake" });
    expect(JSON.stringify(entries)).not.toContain(SECRET);
    expect(JSON.stringify(entries)).not.toContain(SALT);
  });

  it("refuses an invalid environment, a missing hash secret, or a real provider before PD-24", async () => {
    await expect(
      buildWorker({ SUPABASE_URL: "not-a-url" }, () => undefined, limitsDb),
    ).rejects.toThrow(EnvValidationError);
    await expect(
      buildWorker({ ...env, AUTHOR_HASH_SECRET: "short" }, () => undefined, limitsDb),
    ).rejects.toThrow(/AUTHOR_HASH_SECRET/);
    await expect(
      buildWorker({ ...env, AI_PROVIDER: "openai" }, () => undefined, limitsDb),
    ).rejects.toThrow(/AI_PROVIDER/);
  });
});
