// S7.5a — queue and worker faults (F6–F8): a frozen ("zombie") worker loses
// its lease and cannot overwrite the work of the worker that took over; a
// lost queue message is re-sent by the orphan sweep; a malformed message on
// the real queue is archived without stopping the worker. S7.5b (F6b): the
// step start is atomic, so the stale worker cannot reset a newer attempt's
// step between its ownership check and its write.
import { isLeaseLost } from "@sor/database";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobsRepo } from "@sor/database";
import { D5_AGENT_KEY, D6_AGENT_KEY } from "@sor/discovery-engine";
import {
  available,
  cancelOpenJobs,
  db,
  expectInvariants,
  job,
  makeWorker,
  product,
  requestEnrichment,
  ScriptedProvider,
  sleep,
  startSite,
  waitFor,
  workspace,
  type Site,
} from "./harness";

const suite = available ? describe : describe.skip;

function psqlAvailable(): boolean {
  if (!process.env.DB_URL) return false;
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

suite("queue and worker faults", () => {
  let site: Site;
  beforeAll(async () => {
    site = await startSite();
  });
  afterAll(async () => {
    await cancelOpenJobs();
    await site.close();
  });

  it("F6: a frozen worker loses its lease; the new owner's work stands, nothing is duplicated", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    // Worker A: no heartbeat within its 2 s lease (frozen process), and a
    // verification call that takes 4 s.
    const slow = new ScriptedProvider({ [D6_AGENT_KEY]: [{ slowMs: 4000 }] });
    const a = makeWorker({
      provider: slow,
      port: site.port,
      workerId: "res-zombie-a",
      leaseSeconds: 2,
      heartbeatSeconds: 30,
      modelTimeoutMs: 10_000,
    });
    const { jobId } = await requestEnrichment(ws, productId);
    const zombie = a.worker.tick();
    await sleep(2500); // lease and message visibility expire

    const fresh = new ScriptedProvider({});
    const b = makeWorker({ provider: fresh, port: site.port, workerId: "res-owner-b" });
    const done = await waitFor(jobId, b.worker);
    expect(done).toMatchObject({ state: "completed", attempt_count: 2 });
    expect(fresh.count(D5_AGENT_KEY)).toBe(0); // A's extraction reused
    const stepOf = async (agent: string) =>
      (
        await db()
          .from("agent_step_runs")
          .select("state, attempt, completed_at, output_hash")
          .eq("job_execution_id", jobId)
          .eq("agent_key", agent)
          .single()
      ).data;
    const verifiedByB = await stepOf(D6_AGENT_KEY);
    expect(verifiedByB).toMatchObject({ state: "completed", attempt: 2 });

    // A wakes up: it must not fail, overwrite the result or duplicate evidence.
    await expect(zombie).resolves.toBeDefined();
    expect(a.logs.some((l) => l.msg === "lease lost; another worker owns the job")).toBe(true);
    // B's verification step is untouched: not overwritten, not marked failed.
    expect(await stepOf(D6_AGENT_KEY)).toEqual(verifiedByB);
    const after = await job(jobId);
    expect(after).toMatchObject({ state: "completed", attempt_count: 2, lease_owner: null });
    const { data: apply } = await db()
      .from("agent_step_runs")
      .select("state")
      .eq("job_execution_id", jobId)
      .eq("agent_key", "enrichment_apply");
    expect(apply).toEqual([{ state: "completed" }]);
    await expectInvariants(jobId, productId);
  }, 60_000);

  it("F6b: a stale worker cannot start or reset a step of the newer attempt (atomic start)", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    const { jobId } = await requestEnrichment(ws, productId);
    const step = {
      jobId,
      agentKey: "res_probe",
      stepKey: "probe",
      contractVersion: "probe-1",
      promptVersion: null,
    };
    expect((await jobsRepo.workerClaim(db(), jobId, "res-stale-a", 1))?.attempt_count).toBe(1);
    await jobsRepo.startStep(db(), {
      ...step,
      workerId: "res-stale-a",
      attempt: 1,
      inputHash: "a",
    });
    await sleep(1200); // A's lease expires; B recovers the job
    expect((await jobsRepo.workerClaim(db(), jobId, "res-owner-b", 30))?.attempt_count).toBe(2);
    const id = await jobsRepo.startStep(db(), {
      ...step,
      workerId: "res-owner-b",
      attempt: 2,
      inputHash: "b",
    });
    const err = await jobsRepo
      .startStep(db(), { ...step, workerId: "res-stale-a", attempt: 1, inputHash: "a" })
      .catch((e: unknown) => e);
    expect(isLeaseLost(err)).toBe(true);
    const { data: row } = await db()
      .from("agent_step_runs")
      .select("id, attempt, state, input_hash")
      .eq("job_execution_id", jobId)
      .eq("agent_key", "res_probe")
      .single();
    expect(row).toEqual({ id, attempt: 2, state: "running", input_hash: "b" });
    await jobsRepo.workerFinish(db(), {
      jobId,
      workerId: "res-owner-b",
      state: "cancelled",
      terminalReason: "cancelled",
    });
    await expectInvariants(jobId, productId);
  }, 30_000);

  it("F7: a lost queue message is re-sent by the orphan sweep and the job completes", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    const { jobId } = await requestEnrichment(ws, productId);
    const lost = (await job(jobId)).queue_message_id;
    expect(lost).not.toBeNull();
    await jobsRepo.workerFinishPoison(db(), lost!, "S7.5 simulation: message lost");

    const { worker } = makeWorker({ provider: new ScriptedProvider({}), port: site.port });
    await worker.tick();
    expect((await job(jobId)).state).toBe("queued"); // nothing to read: the job waits

    expect(await jobsRepo.workerRequeueOrphans(db(), 0)).toBeGreaterThanOrEqual(1);
    const j = await waitFor(jobId, worker);
    expect(j).toMatchObject({ state: "completed", attempt_count: 1 });
    expect(j.queue_message_id).not.toBe(lost);
    await expectInvariants(jobId, productId);
  }, 60_000);

  it.runIf(psqlAvailable())(
    "F8: a malformed message on the real queue is archived and audited; the worker goes on",
    async () => {
      const out = execFileSync(
        "psql",
        [
          process.env.DB_URL as string,
          "-At",
          "-c",
          `select pgmq.send('sor_jobs', '{"schema_version":"job.v1","kind":"no_such_kind"}'::jsonb)`,
        ],
        { encoding: "utf8" },
      ).trim();
      const msgId = Number(out.split("\n").at(-1));
      expect(msgId).toBeGreaterThan(0);

      const ws = await workspace();
      const productId = await product(site.port);
      const { jobId } = await requestEnrichment(ws, productId);
      const { worker, logs } = makeWorker({ provider: new ScriptedProvider({}), port: site.port });
      const j = await waitFor(jobId, worker);
      expect(j.state).toBe("completed"); // the healthy job is not blocked by the poison

      expect(logs.some((l) => l.msg === "poison message archived" && l.message_id === msgId)).toBe(
        true,
      );
      const { data: audit } = await db()
        .from("audit_logs")
        .select("action, metadata")
        .eq("action", "queue.poison_message")
        .eq("metadata->>message_id", String(msgId));
      expect(audit).toHaveLength(1);
    },
    60_000,
  );
});
