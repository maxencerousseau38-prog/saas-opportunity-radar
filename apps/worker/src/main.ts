// Persistent worker entry point (Technical Blueprint §8; Implementation
// Blueprint §11). Consumes `sor_jobs` with leases and heartbeats.
import { hostname } from "node:os";
import { pathToFileURL } from "node:url";
import { parseWorkerEnv, type WorkerEnv } from "@sor/contracts/env";
import { createServiceClient, jobsRepo, type DbClient } from "@sor/database";
import { OfficialWebsiteConnector, defaultPolicy } from "@sor/data-sources";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakeEnrichmentHandlers } from "@sor/discovery-engine";
import { fakePainPointHandlers } from "@sor/pain-point-engine";
import { Worker, type JobHandler, type Log } from "./runtime";
import { enrichmentHandler } from "./handlers/enrichment";
import { catalogImportHandler, feedbackImportHandler } from "./handlers/imports";
import { painPointRunHandler } from "./handlers/pain";

const jsonLog: Log = (entry) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
};

/** Cached platform limits (server-side configuration, PD-24 for AI budgets). */
export function limitsLoader(db: DbClient, ttlMs = 60_000) {
  let cached: { at: number; value: Record<string, number> } | null = null;
  return async () => {
    if (!cached || Date.now() - cached.at > ttlMs)
      cached = { at: Date.now(), value: await jobsRepo.readLimits(db) };
    return cached.value;
  };
}

export interface WorkerParts {
  worker: Worker;
  config: WorkerEnv;
  limits: Record<string, number>;
}

/** Builds the worker from a validated environment. Never logs secret values. */
export async function buildWorker(
  env: Record<string, string | undefined>,
  log: Log = jsonLog,
  db?: DbClient,
): Promise<WorkerParts> {
  const config = parseWorkerEnv(env);
  const client =
    db ?? createServiceClient({ url: config.SUPABASE_URL, secretKey: config.SUPABASE_SECRET_KEY });
  const limits = limitsLoader(client);
  const values = await limits();
  // PD-24 pending: the fake provider is the only one available.
  const gateway = new AIGateway({
    provider: new FakeProvider({ ...fakeEnrichmentHandlers, ...fakePainPointHandlers }),
    models: FAKE_MODELS,
  });
  const connector = new OfficialWebsiteConnector({
    policy: defaultPolicy({
      maxBytes: values.fetch_max_bytes ?? 5_242_880,
      timeoutMs: values.fetch_timeout_ms ?? 15_000,
      maxRedirects: values.fetch_max_redirects ?? 5,
    }),
  });
  const handlers: Record<string, JobHandler> = {
    product_enrichment: enrichmentHandler({ db: client, connector, gateway, limits }),
    catalog_import: catalogImportHandler({ db: client, limits }),
    feedback_import: feedbackImportHandler({
      db: client,
      authorHashSecret: config.AUTHOR_HASH_SECRET,
      limits,
    }),
    pain_point_run: painPointRunHandler({ db: client, gateway, limits }),
  };
  const lease = values.job_lease_seconds ?? 120;
  const worker = new Worker({
    db: client,
    workerId:
      config.WORKER_ID ??
      `worker-${hostname()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 40)}-${process.pid}`,
    handlers,
    leaseSeconds: lease,
    heartbeatSeconds: Math.max(
      1,
      Math.min(values.job_heartbeat_seconds ?? 30, Math.floor(lease / 3)),
    ),
    concurrency: Number(config.WORKER_CONCURRENCY),
    jobTimeoutSeconds: values.enrichment_max_seconds ?? 600,
    jobTimeoutSecondsByKind: { pain_point_run: values.pain_max_seconds ?? 1800 },
    log,
  });
  log({
    level: "info",
    msg: "worker configured",
    app_env: config.APP_ENV,
    ai_provider: config.AI_PROVIDER,
    handlers: Object.keys(handlers),
  });
  return { worker, config, limits: values };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  buildWorker(process.env)
    .then(({ worker }) => {
      const stop = () => worker.stop();
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
      return worker.run(2000);
    })
    .catch((error: unknown) => {
      jsonLog({
        level: "error",
        msg: error instanceof Error ? error.name : "worker failed to start",
      });
      process.exitCode = 1;
    });
}
