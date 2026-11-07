// S7.5b — F5: a real PostgreSQL restart (`docker restart` of the local
// Supabase database container) while the worker runs a job. Same criteria as
// F4; the interrupted job resumes once its lease expires. Opt-in
// (RESILIENCE_DB_RESTART=1): CI runs it in its own step, after the other
// scenarios, because it restarts the shared database.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D5_AGENT_KEY } from "@sor/discovery-engine";
import {
  available,
  cancelOpenJobs,
  db,
  expectInvariants,
  sleep,
  startSite,
  workspace,
  type Site,
} from "./harness";
import { jobThroughOutage } from "./outage-run";

function dbContainer(): string | null {
  if (process.env.RESILIENCE_DB_RESTART !== "1") return null;
  try {
    const out = execFileSync(
      "docker",
      ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
      { encoding: "utf8" },
    );
    return out.split("\n").find((n) => n.trim() !== "") ?? null;
  } catch {
    return null;
  }
}

/** Waits (bounded) until the API answers database reads and the auth admin API works. */
async function waitHealthy(maxMs: number): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { error } = await db().from("platform_limits").select("key").limit(1);
    if (!error) {
      const auth = await db().auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!auth.error) return Date.now() - start;
    }
    await sleep(500);
  }
  throw new Error(`the stack was not healthy again within ${maxMs} ms`);
}

const container = available ? dbContainer() : null;
const suite = container ? describe : describe.skip;

suite("real PostgreSQL restart", () => {
  let site: Site;
  beforeAll(async () => {
    site = await startSite();
  });
  afterAll(async () => {
    await cancelOpenJobs();
    await site.close();
  });

  it("F5: the database restarts during a job — the worker survives, the job resumes", async () => {
    let recoveryMs = 0;
    const r = await jobThroughOutage({
      site,
      outage: async () => {
        execFileSync("docker", ["restart", container as string], { stdio: "ignore" });
        recoveryMs = await waitHealthy(120_000);
      },
      maxMs: 90_000,
    });
    process.stdout.write(
      `F5: stack healthy ${recoveryMs} ms after the database container restarted\n`,
    );
    expect(r.logs.some((l) => l.msg === "worker cycle failed")).toBe(true);
    expect(r.maxIdleMs).toBeLessThan(60_000); // far from the 300 s stall watchdog
    expect(r.job.state).toBe("completed");
    expect(r.job.attempt_count).toBeGreaterThanOrEqual(2);
    expect(r.provider.count(D5_AGENT_KEY)).toBe(1);
    await expectInvariants(r.jobId, r.productId);
    // The whole stack works again (auth included) for whatever runs next.
    await expect(workspace()).resolves.toMatchObject({ id: expect.any(String) });
  }, 300_000);
});
