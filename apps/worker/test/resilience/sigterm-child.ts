// F13 child process (S7.5b): the real worker lifecycle (`runProcess`: signal
// handlers, SIGTERM drain, lease release, exit code) around a worker built
// with the resilience fixtures: scripted provider whose verification calls
// take 60 s ("heavy" jobs), loopback fixture site. Bundled by
// tsup.resilience.config.ts and started by sigterm.test.ts.
import { parseWorkerEnv } from "@sor/contracts/env";
import { D6_AGENT_KEY } from "@sor/discovery-engine";
import { runProcess } from "../../src/main";
import { ScriptedProvider, db, makeWorker } from "./fixtures";

const env = process.env;
void runProcess(env, undefined, async () => {
  const provider = new ScriptedProvider({}, { [D6_AGENT_KEY]: { slowMs: 60_000 } });
  const { worker } = makeWorker({
    provider,
    port: Number(env.FIXTURE_SITE_PORT),
    workerId: env.WORKER_ID as string,
    leaseSeconds: 60, // long: the jobs restart elsewhere only because they are released
    heartbeatSeconds: 1,
    modelTimeoutMs: 120_000,
  });
  return { worker, config: parseWorkerEnv(env), limits: {}, db: db() };
});
