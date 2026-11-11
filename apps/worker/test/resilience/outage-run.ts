// Shared scenario of F4 and F5 (S7.5b): an enrichment job is in its slow
// verification step when the database side becomes unreachable; the worker
// loop runs (`Worker.run`, as in production) throughout. Returns what the
// assertions need.
import { D6_AGENT_KEY } from "@sor/discovery-engine";
import type { DbClient } from "@sor/database";
import {
  ScriptedProvider,
  TERMINAL,
  job,
  makeWorker,
  product,
  requestEnrichment,
  sleep,
  workspace,
  type Site,
} from "./fixtures";

export async function jobThroughOutage(o: {
  site: Site;
  /** Client of the worker (the healthy one for a real restart). */
  client?: DbClient;
  /** Starts the outage and resolves once the database side is back. */
  outage: () => Promise<void>;
  maxMs?: number;
}) {
  const ws = await workspace();
  const productId = await product(o.site.port);
  const provider = new ScriptedProvider({ [D6_AGENT_KEY]: [{ slowMs: 1500 }] });
  const { worker, logs } = makeWorker({
    provider,
    port: o.site.port,
    ...(o.client ? { client: o.client } : {}),
  });
  const { jobId } = await requestEnrichment(ws, productId);
  const loop = worker.run(100, 3600);
  let maxIdleMs = 0;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      maxIdleMs = Math.max(maxIdleMs, worker.msSinceProgress());
      await sleep(100);
    }
  })();
  try {
    const end = Date.now() + 30_000;
    while (provider.count(D6_AGENT_KEY) === 0) {
      if (Date.now() > end) throw new Error("the job never reached its verification step");
      await sleep(50);
    }
    await o.outage();
    const deadline = Date.now() + (o.maxMs ?? 60_000);
    let j = await job(jobId);
    while (!TERMINAL.includes(j.state)) {
      if (Date.now() > deadline) throw new Error(`job ${jobId} stuck in ${j.state}`);
      await sleep(250);
      j = await job(jobId);
    }
    return { job: j, jobId, productId, provider, logs, maxIdleMs };
  } finally {
    sampling = false;
    worker.stop();
    await loop;
    await sampler;
  }
}
