// S7.5b — F4: the Supabase API is unreachable for 20 s while the worker runs
// a job (every request of the worker's client fails like an unreachable
// host). The worker stays alive (cycle failures logged, progress recorded so
// the watchdog never fires), then the job resumes after its lease expires,
// reusing the completed extraction step, with no duplicated step or evidence.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D5_AGENT_KEY } from "@sor/discovery-engine";
import {
  ApiOutage,
  available,
  cancelOpenJobs,
  dbBehind,
  expectInvariants,
  sleep,
  startSite,
  type Site,
} from "./harness";
import { jobThroughOutage } from "./outage-run";

const suite = available ? describe : describe.skip;

suite("Supabase API outage", () => {
  let site: Site;
  beforeAll(async () => {
    site = await startSite();
  });
  afterAll(async () => {
    await cancelOpenJobs();
    await site.close();
  });

  it("F4: 20 s without the API — the worker survives, the job resumes, nothing is duplicated", async () => {
    const outage = new ApiOutage();
    const r = await jobThroughOutage({
      site,
      client: dbBehind(outage),
      outage: async () => {
        outage.down = true;
        await sleep(20_000);
        outage.down = false;
      },
    });
    expect(outage.failed).toBeGreaterThan(0);
    expect(r.logs.some((l) => l.msg === "worker cycle failed")).toBe(true);
    // The loop kept recording progress: the stall watchdog (300 s by
    // default) is never close to firing.
    expect(r.maxIdleMs).toBeLessThan(5_000);
    expect(r.job.state).toBe("completed");
    expect(r.job.attempt_count).toBeGreaterThanOrEqual(2);
    expect(r.provider.count(D5_AGENT_KEY)).toBe(1); // extraction reused after the outage
    await expectInvariants(r.jobId, r.productId);
  }, 90_000);
});
