// Fault-injection fixtures (Sprint 7, S7.5): reproducible failures on the
// local Supabase stack, no network and no paid call. No test-runner import:
// the SIGTERM child process (F13) bundles this module. Provider faults come
// from a scripted fake provider, source faults from a loopback fixture site;
// timings are small and fixed (no uncontrolled randomness).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createServiceClient, discoveryRepo, jobsRepo, type DbClient } from "@sor/database";
import { OfficialWebsiteConnector, defaultPolicy, isPublicAddress } from "@sor/data-sources";
import {
  AIGateway,
  FAKE_MODELS,
  FakeProvider,
  ProviderError,
  type AIProvider,
  type EmbeddingResult,
  type ProviderCall,
  type ProviderResponse,
} from "@sor/ai-gateway";
import { fakeDiscoveryHandlers, fakeEnrichmentHandlers } from "@sor/discovery-engine";
import { Worker, type JobHandler } from "../../src/runtime";
import { enrichmentHandler } from "../../src/handlers/enrichment";
import { catalogImportHandler } from "../../src/handlers/imports";
import { discoveryRunHandler } from "../../src/handlers/discovery";
import { limitsLoader } from "../../src/main";

export const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
export const secretKey = process.env.SUPABASE_SECRET_KEY;
export const available = Boolean(url && secretKey);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const hash = () => randomUUID().replace(/-/g, "").padEnd(64, "0");
export const TERMINAL = ["completed", "partial", "failed", "cancelled", "dead_letter"];

let client: DbClient | null = null;
export function db(): DbClient {
  client ??= createServiceClient({ url: url as string, secretKey: secretKey as string });
  return client;
}

/**
 * Supabase API outage switch (S7.5b, F4): while `down`, every request of the
 * client fails like an unreachable host (`TypeError: fetch failed`).
 */
export class ApiOutage {
  down = false;
  failed = 0;
  readonly fetch: typeof fetch = (input, init) => {
    if (this.down) {
      this.failed += 1;
      return Promise.reject(new TypeError("fetch failed"));
    }
    return fetch(input, init);
  };
}

/** A service client whose transport goes through `outage`. */
export function dbBehind(outage: ApiOutage): DbClient {
  return createServiceClient({
    url: url as string,
    secretKey: secretKey as string,
    fetch: outage.fetch,
  });
}

// ---------------------------------------------------------------- fixture site
const PAGES: Record<string, string> = {
  "/": `<title>Acme Metrics</title><p>Acme Metrics turns ad spend data into clear weekly reports.</p>
        <a href="/pricing">Pricing</a>`,
  "/pricing": "<h1>Pricing</h1><p>Starter 19 € / mois</p><p>Growth 49 € / mois</p>",
};

/** What the fixture site does for one host and path (S7.5b, F9). */
export type SiteFault = "ok" | "http500" | "reset" | { slowMs: number };

export interface Site {
  port: number;
  /** Sets the behaviour of `host` (or "*" for every host) on `path`. */
  fault(host: string, path: string, mode: SiteFault): void;
  /** Requests received per "host path". */
  hits: Map<string, number>;
  close(): Promise<void>;
}

export async function startSite(): Promise<Site> {
  const faults = new Map<string, SiteFault>();
  const hits = new Map<string, number>();
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    const host = (req.headers.host ?? "").split(":")[0] ?? "";
    hits.set(`${host} ${path}`, (hits.get(`${host} ${path}`) ?? 0) + 1);
    const mode = faults.get(`${host} ${path}`) ?? faults.get(`* ${path}`) ?? "ok";
    if (mode === "reset") {
      req.socket.destroy(); // connection cut before any response
      return;
    }
    if (mode === "http500") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("internal error");
      return;
    }
    const answer = () => {
      if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      const page = PAGES[path];
      res.writeHead(page ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
      res.end(page ?? "missing");
    };
    if (typeof mode === "object") {
      const t = setTimeout(answer, mode.slowMs);
      res.on("close", () => clearTimeout(t));
    } else answer();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as AddressInfo).port,
    fault: (host, path, mode) => faults.set(`${host} ${path}`, mode),
    hits,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

// ---------------------------------------------------------------- data
export async function workspace(): Promise<{ id: string; user: string }> {
  const { data, error } = await db().auth.admin.createUser({
    email: `res-${randomUUID()}@demo.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const id = randomUUID();
  await db()
    .from("workspaces")
    .insert({ id, name: "Resilience", created_by: data.user.id })
    .throwOnError();
  await db()
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: data.user.id, role: "owner" })
    .throwOnError();
  return { id, user: data.user.id };
}

/** An active, eligible product whose official site is the fixture site. */
export async function product(port: number): Promise<string> {
  const id = randomUUID();
  const host = `res-${id.slice(0, 8)}.test`;
  const site = `http://${host}:${port}/`;
  await db()
    .from("saas_products")
    .insert({
      id,
      name: `Acme ${host}`,
      slug: `acme-${id.slice(0, 8)}`,
      website_url: site,
      record_status: "active",
      exclusion_status: "eligible",
    })
    .throwOnError();
  await db()
    .from("entity_identifiers")
    .insert({
      product_id: id,
      identifier_type: "canonical_url",
      value_normalized: site.replace(/\/$/, ""),
      is_primary: true,
    })
    .throwOnError();
  return id;
}

export function requestEnrichment(
  ws: { id: string; user: string },
  productId: string,
  key = `res-${randomUUID()}`,
) {
  return jobsRepo.requestJob(db(), {
    kind: "product_enrichment",
    workspaceId: ws.id,
    requestedBy: ws.user,
    idempotencyKey: key,
    requestHash: hash(),
    payload: { product_id: productId } as never,
  });
}

/** A discovery run on seed URLs only (no search channel, no network). */
export function requestDiscovery(ws: { id: string; user: string }, seedUrls: string[]) {
  return discoveryRepo.requestDiscoveryRun(db(), {
    workspaceId: ws.id,
    userId: ws.user,
    idempotencyKey: `res-${randomUUID()}`,
    requestHash: hash(),
    request: {
      title: "Resilience",
      prompt: "Find small marketing analytics SaaS",
      channels: {
        search: false,
        official_site_rebound: { enabled: false, seed_product_ids: [] },
        seed_urls: seedUrls,
      },
    },
  });
}

// ---------------------------------------------------------------- scripted provider
/** What the provider does on one call of an agent. */
export type Fault = "ok" | "transient" | "permanent" | { slowMs: number };

/**
 * Wraps the fake provider: each agent consumes its script, one entry per
 * call; once the script is exhausted the agent answers normally (or keeps
 * failing with `always`).
 */
export class ScriptedProvider implements AIProvider {
  readonly id = "fake";
  readonly calls: Array<{ agentKey: string; fault: string }> = [];
  private readonly inner: FakeProvider;

  constructor(
    private readonly script: Record<string, Fault[]>,
    private readonly always: Record<string, Fault> = {},
    handlers = { ...fakeEnrichmentHandlers, ...fakeDiscoveryHandlers },
  ) {
    this.inner = new FakeProvider(handlers);
  }

  estimateMaxCostUsd(): number {
    return 0;
  }

  async generate(call: ProviderCall): Promise<ProviderResponse> {
    const key = call.request.agentKey;
    const fault = this.script[key]?.shift() ?? this.always[key] ?? "ok";
    this.calls.push({ agentKey: key, fault: typeof fault === "string" ? fault : "slow" });
    if (fault === "transient") throw new ProviderError("simulated overload (503)", true);
    if (fault === "permanent") throw new ProviderError("simulated refusal (400)", false);
    if (typeof fault === "object") {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, fault.slowMs);
        call.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    }
    return this.inner.generate(call);
  }

  embed(texts: string[], model: string): Promise<EmbeddingResult> {
    return this.inner.embed(texts, model);
  }

  count(agentKey: string): number {
    return this.calls.filter((c) => c.agentKey === agentKey).length;
  }
}

// ---------------------------------------------------------------- worker
export interface WorkerSetup {
  provider: AIProvider;
  port: number;
  workerId?: string;
  leaseSeconds?: number;
  heartbeatSeconds?: number;
  /** Provider timeout per call (all model profiles). */
  modelTimeoutMs?: number;
  /** Official-site fetch timeout (default 5 s). */
  fetchTimeoutMs?: number;
  /** Client used by the worker and its handlers (default: the healthy one). */
  client?: DbClient;
  concurrency?: number;
}

export function makeWorker(o: WorkerSetup) {
  const client = o.client ?? db();
  const connector = new OfficialWebsiteConnector({
    policy: defaultPolicy({
      resolve: async (h) => (h.endsWith(".test") ? [{ address: "127.0.0.1", family: 4 }] : []),
      isAddressAllowed: (a) => a === "127.0.0.1" || isPublicAddress(a),
      timeoutMs: o.fetchTimeoutMs ?? 5000,
    }),
    minIntervalMs: 0,
  });
  const limits = limitsLoader(client, 0);
  const models = o.modelTimeoutMs
    ? Object.fromEntries(
        Object.entries(FAKE_MODELS).map(([k, model]) => [
          k,
          { model, timeoutMs: o.modelTimeoutMs },
        ]),
      )
    : FAKE_MODELS;
  const gateway = new AIGateway({ provider: o.provider, models });
  const handlers: Record<string, JobHandler> = {
    product_enrichment: enrichmentHandler({ db: client, connector, gateway, limits }),
    catalog_import: catalogImportHandler({ db: client, limits }),
    discovery_run: discoveryRunHandler({
      db: client,
      officialSite: connector,
      gateway,
      limits,
      fetchPolicy: defaultPolicy(),
    }),
  };
  const logs: Array<Record<string, unknown>> = [];
  const worker = new Worker({
    db: client,
    workerId: o.workerId ?? `res-${randomUUID().slice(0, 8)}`,
    handlers,
    leaseSeconds: o.leaseSeconds ?? 2,
    heartbeatSeconds: o.heartbeatSeconds ?? 0.5,
    concurrency: o.concurrency ?? 5,
    jobTimeoutSeconds: 60,
    backoff: { baseSeconds: 1, capSeconds: 1, random: () => 0 },
    log: (e) => logs.push(e),
  });
  return { worker, handlers, logs };
}

export async function job(jobId: string) {
  const { data } = await db().from("job_executions").select("*").eq("id", jobId).single();
  return data!;
}

/** Ticks the worker until the job is terminal (or the predicate holds). */
export async function waitFor(
  jobId: string,
  worker: Worker,
  done: (j: Awaited<ReturnType<typeof job>>) => boolean = (j) => TERMINAL.includes(j.state),
  maxMs = 30_000,
) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await worker.tick();
    const j = await job(jobId);
    if (done(j)) return j;
    await sleep(200);
  }
  throw new Error(`job ${jobId} did not reach the expected state in ${maxMs} ms`);
}

/** Temporarily changes platform limits (restored by the returned function). */
export async function withLimits(values: Record<string, string>): Promise<() => Promise<void>> {
  const keys = Object.keys(values);
  const { data: before } = await db().from("platform_limits").select("key, value").in("key", keys);
  for (const [key, value] of Object.entries(values))
    await db()
      .from("platform_limits")
      .update({ value: JSON.parse(value) })
      .eq("key", key)
      .throwOnError();
  return async () => {
    for (const row of before ?? [])
      await db()
        .from("platform_limits")
        .update({ value: row.value })
        .eq("key", row.key)
        .throwOnError();
  };
}
