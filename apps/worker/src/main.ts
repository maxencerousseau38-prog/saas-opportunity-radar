// Persistent worker entry point (Technical Blueprint §8).
// Sprint 0: validates its environment and stops. Queue consumption and job
// handlers arrive in Sprint 3 (Implementation Blueprint §11).
import { pathToFileURL } from "node:url";
import { parseWorkerEnv } from "@sor/contracts/env";

type Log = (entry: Record<string, unknown>) => void;

const jsonLog: Log = (entry) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
};

/** Returns the process exit code. Never logs secret values. */
export function main(
  env: Record<string, string | undefined> = process.env,
  log: Log = jsonLog,
): number {
  const config = parseWorkerEnv(env);
  log({
    level: "info",
    msg: "worker skeleton started; no job handlers are registered before Sprint 3",
    app_env: config.APP_ENV,
    worker_id: config.WORKER_ID ?? null,
  });
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    jsonLog({
      level: "error",
      msg: error instanceof Error ? error.message : "worker failed to start",
    });
    process.exitCode = 1;
  }
}
