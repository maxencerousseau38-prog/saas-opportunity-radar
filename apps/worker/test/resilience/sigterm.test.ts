// S7.5b — F13: SIGTERM while the worker process runs two heavy jobs. The
// real process lifecycle (sigterm-child.ts → runProcess) drains for 1 s,
// aborts and releases both jobs, and exits 0. Another worker picks them up at
// once (their lease was 60 s: only the release makes them available) and
// completes them, reusing the steps the first process completed.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D5_AGENT_KEY, D6_AGENT_KEY } from "@sor/discovery-engine";
import {
  ScriptedProvider,
  available,
  db,
  expectInvariants,
  job,
  makeWorker,
  product,
  requestEnrichment,
  secretKey,
  sleep,
  startSite,
  url,
  waitFor,
  workspace,
  type Site,
} from "./harness";

const suite = available ? describe : describe.skip;
const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const childFile = resolve(workerDir, "dist/resilience/sigterm-child.js");

async function until(what: string, check: () => Promise<boolean>, maxMs: number) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

suite("worker shutdown under load", () => {
  let site: Site;
  beforeAll(async () => {
    site = await startSite();
    execFileSync("pnpm", ["exec", "tsup", "--config", "tsup.resilience.config.ts"], {
      cwd: workerDir,
      stdio: "ignore",
    });
  }, 60_000);
  afterAll(async () => {
    await site.close();
  });

  it("F13: SIGTERM during two heavy jobs → both released, exit 0, completed by another worker", async () => {
    const jobs: Array<{ jobId: string; productId: string }> = [];
    for (let i = 0; i < 2; i++) {
      const ws = await workspace();
      const productId = await product(site.port);
      jobs.push({ jobId: (await requestEnrichment(ws, productId)).jobId, productId });
    }
    const workerId = `res-sigterm-${randomUUID().slice(0, 8)}`;
    const child = spawn(process.execPath, [childFile], {
      cwd: workerDir,
      env: {
        PATH: process.env.PATH,
        APP_ENV: "local",
        SUPABASE_URL: url,
        SUPABASE_SECRET_KEY: secretKey,
        AUTHOR_HASH_SECRET: "resilience-test-author-hash-secret-0000",
        WORKER_ID: workerId,
        WORKER_CONCURRENCY: "5",
        WORKER_SHUTDOWN_GRACE_SECONDS: "1",
        WORKER_MONITOR_INTERVAL_SECONDS: "0",
        FIXTURE_SITE_PORT: String(site.port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines: Array<Record<string, unknown>> = [];
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const p of parts) {
        try {
          lines.push(JSON.parse(p) as Record<string, unknown>);
        } catch {
          lines.push({ raw: p });
        }
      }
    });
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));

    try {
      // Both jobs are in their heavy step (verification) in the child.
      await until(
        "both jobs to be verifying in the child",
        async () => {
          const { data } = await db()
            .from("agent_step_runs")
            .select("job_execution_id")
            .eq("agent_key", D6_AGENT_KEY)
            .eq("state", "running")
            .in(
              "job_execution_id",
              jobs.map((j) => j.jobId),
            );
          return (data ?? []).length === 2;
        },
        30_000,
      );
      for (const j of jobs) expect((await job(j.jobId)).lease_owner).toBe(workerId);

      child.kill("SIGTERM");
      const code = await Promise.race([exited, sleep(20_000).then(() => "timeout" as const)]);
      expect(code).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }

    const released = lines.filter((l) => l.msg === "job released on shutdown");
    expect(released.map((l) => l.job_execution_id)).toEqual(
      expect.arrayContaining(jobs.map((j) => j.jobId)),
    );
    expect(lines.find((l) => l.msg === "worker stopped")?.released_jobs).toBeGreaterThanOrEqual(2);
    for (const j of jobs) {
      expect(await job(j.jobId)).toMatchObject({
        state: "retrying",
        attempt_count: 0,
        lease_owner: null,
        last_error_code: "WORKER_SHUTDOWN",
      });
    }

    // Another worker takes them over immediately (no lease expiry needed).
    const provider = new ScriptedProvider({});
    const other = makeWorker({ provider, port: site.port });
    for (const j of jobs) {
      const done = await waitFor(j.jobId, other.worker, undefined, 20_000);
      expect(done).toMatchObject({ state: "completed", attempt_count: 1 });
      await expectInvariants(j.jobId, j.productId);
    }
    expect(provider.count(D5_AGENT_KEY)).toBe(0); // extraction reused from the stopped process
    expect(provider.count(D6_AGENT_KEY)).toBe(2);
  }, 120_000);
});
