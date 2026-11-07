// Persistent worker entry point (Technical Blueprint §8; Implementation
// Blueprint §11). Consumes `sor_jobs` with leases and heartbeats.
import { hostname } from "node:os";
import { pathToFileURL } from "node:url";
import { parseWorkerEnv, type WorkerEnv } from "@sor/contracts/env";
import { createServiceClient, jobsRepo, type DbClient } from "@sor/database";
import { OfficialWebsiteConnector, defaultPolicy } from "@sor/data-sources";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakeDiscoveryHandlers, fakeEnrichmentHandlers } from "@sor/discovery-engine";
import { fakeOpportunityHandlers } from "@sor/opportunity-engine";
import { fakePainPointHandlers } from "@sor/pain-point-engine";
import { Worker, type JobHandler, type Log } from "./runtime";
import { startWatchdog } from "./watchdog";
import { startOpsMonitor } from "./monitor";
import { enrichmentHandler } from "./handlers/enrichment";
import { catalogImportHandler, feedbackImportHandler } from "./handlers/imports";
import { painPointRunHandler } from "./handlers/pain";
import { opportunityAnalysisHandler, reportExportHandler } from "./handlers/analysis";
import { discoveryRunHandler } from "./handlers/discovery";

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
  db: DbClient;
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
    provider: new FakeProvider({
      ...fakeEnrichmentHandlers,
      ...fakeDiscoveryHandlers,
      ...fakePainPointHandlers,
      ...fakeOpportunityHandlers,
    }),
    models: FAKE_MODELS,
  });
  const fetchPolicy = defaultPolicy({
    maxBytes: values.fetch_max_bytes ?? 5_242_880,
    timeoutMs: values.fetch_timeout_ms ?? 15_000,
    maxRedirects: values.fetch_max_redirects ?? 5,
  });
  const connector = new OfficialWebsiteConnector({ policy: fetchPolicy });
  const handlers: Record<string, JobHandler> = {
    product_enrichment: enrichmentHandler({ db: client, connector, gateway, limits }),
    catalog_import: catalogImportHandler({ db: client, limits }),
    feedback_import: feedbackImportHandler({
      db: client,
      authorHashSecret: config.AUTHOR_HASH_SECRET,
      limits,
    }),
    pain_point_run: painPointRunHandler({ db: client, gateway, limits }),
    opportunity_analysis: opportunityAnalysisHandler({ db: client, gateway, limits }),
    report_export: reportExportHandler({ db: client }),
    // Search sources stay disabled in the registry (PD-28, docs/DATA_SOURCES.md).
    discovery_run: discoveryRunHandler({
      db: client,
      officialSite: connector,
      gateway,
      limits,
      fetchPolicy,
    }),
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
    jobTimeoutSecondsByKind: {
      pain_point_run: values.pain_max_seconds ?? 1800,
      opportunity_analysis: values.analysis_max_seconds ?? 3600,
      discovery_run: values.discovery_max_seconds ?? 1800,
    },
    log,
  });
  log({
    level: "info",
    msg: "worker configured",
    app_env: config.APP_ENV,
    ai_provider: config.AI_PROVIDER,
    handlers: Object.keys(handlers),
  });
  return { worker, config, limits: values, db: client };
}

/** One JSON line of process health (memory is the main sizing input, PD-27). */
export function processStats(worker: Worker) {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1048576);
  return {
    rss_mb: mb(m.rss),
    heap_used_mb: mb(m.heapUsed),
    heap_total_mb: mb(m.heapTotal),
    external_mb: mb(m.external),
    running_jobs: worker.runningJobs(),
    ms_since_progress: worker.msSinceProgress(),
  };
}

/**
 * Process lifecycle on a container host: SIGTERM drains (running jobs get a
 * grace period, then are released), a second signal stops at once, fatal
 * errors exit non-zero so the host restarts the process, and a watchdog
 * exits when the worker stops making progress.
 */
export async function runProcess(env: Record<string, string | undefined>, log: Log = jsonLog) {
  const { worker, config, db } = await buildWorker(env, log);
  const watchdog = startWatchdog({
    blockedMs: Number(config.WORKER_WATCHDOG_BLOCKED_SECONDS) * 1000,
    stalledMs: Number(config.WORKER_WATCHDOG_STALL_SECONDS) * 1000,
    msSinceProgress: () => worker.msSinceProgress(),
    log,
  });
  const stats = setInterval(
    () => log({ level: "info", msg: "worker stats", ...processStats(worker) }),
    300_000,
  );
  stats.unref();
  // Platform snapshot and alerts (S7.3); "0" disables it on extra workers.
  const monitor = startOpsMonitor({
    db,
    intervalMs: Number(config.WORKER_MONITOR_INTERVAL_SECONDS) * 1000,
    log,
  });

  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) {
      log({ level: "warn", msg: "second signal: stopping now", signal });
      worker.stop();
      process.exit(1);
    }
    stopping = true;
    const graceMs = Number(config.WORKER_SHUTDOWN_GRACE_SECONDS) * 1000;
    log({
      level: "info",
      msg: "shutdown requested",
      signal,
      running_jobs: worker.runningJobs(),
      grace_ms: graceMs,
    });
    monitor.stop();
    void worker.shutdown(graceMs).then(({ released }) => {
      watchdog.stop();
      log({
        level: "info",
        msg: "worker stopped",
        released_jobs: released,
        ...processStats(worker),
      });
      process.exit(0);
    });
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  const fatal = (kind: string) => (err: unknown) => {
    log({ level: "fatal", msg: kind, error: err instanceof Error ? err.name : "unknown" });
    process.exit(1);
  };
  process.on("uncaughtException", fatal("uncaught exception"));
  process.on("unhandledRejection", fatal("unhandled rejection"));

  log({ level: "info", msg: "worker started", ...processStats(worker) });
  await worker.run(2000);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runProcess(process.env).catch((error: unknown) => {
    jsonLog({
      level: "error",
      msg: error instanceof Error ? error.name : "worker failed to start",
    });
    process.exitCode = 1;
  });
}
