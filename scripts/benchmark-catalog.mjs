#!/usr/bin/env node
import { createHash, createHmac, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { cpus, homedir, totalmem } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_SQL = resolve(ROOT, "scripts/benchmark-catalog-seed.sql");
const READ_SQL = resolve(ROOT, "scripts/benchmark-catalog-read.sql");
const COUNT_SQL = resolve(ROOT, "scripts/benchmark-catalog-count.sql");
const INSPECT_SQL = resolve(ROOT, "scripts/benchmark-catalog-inspect.sql");
const BOUNDARY_SQL = resolve(ROOT, "scripts/benchmark-catalog-boundary.sql");
const CLEANUP_SQL = resolve(ROOT, "scripts/benchmark-catalog-cleanup.sql");
const SQL_FILES = [SEED_SQL, READ_SQL, COUNT_SQL, INSPECT_SQL, BOUNDARY_SQL, CLEANUP_SQL];
const PREFIX = "sorbench-s75c";
const SCALES = [2_000, 10_000, 50_000];
const CLIENTS = [1, 10];
const TRANSACTIONS_PER_CLIENT = 100;
const dockerCandidates = [
  resolve(
    homedir(),
    "AppData",
    "Local",
    "Programs",
    "DockerDesktop",
    "resources",
    "bin",
    "docker.exe",
  ),
  process.env.ProgramFiles
    ? resolve(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
    : null,
].filter(Boolean);
const DOCKER =
  process.env.SOR_S75C_DOCKER_BIN ||
  dockerCandidates.find((candidate) => existsSync(candidate)) ||
  "docker";
const DB_CONTAINER = "supabase_db_saas-opportunity-radar";
const DB_SOCKET = "/var/run/postgresql";
const DB_PORT = "5432";
const COMMAND_TIMEOUT_MS = Number(process.env.SOR_S75C_COMMAND_TIMEOUT_MS ?? 900_000);
const CONTAINER_TIMEOUT_SECONDS = Math.max(1, Math.floor(COMMAND_TIMEOUT_MS / 1_000) - 10);
const shutdownController = new AbortController();
let shutdownSignal = null;
let activeChild = null;
let activeChildMayFinish = false;

if (!Number.isSafeInteger(COMMAND_TIMEOUT_MS) || COMMAND_TIMEOUT_MS < 11_000) {
  throw new Error("SOR_S75C_COMMAND_TIMEOUT_MS must be an integer of at least 11000 milliseconds.");
}

function handleShutdownSignal(signal) {
  shutdownSignal ??= signal;
  shutdownController.abort(new Error(`Received ${signal}.`));
  if (activeChild && !activeChildMayFinish) activeChild.kill();
}

function throwIfInterrupted() {
  if (shutdownSignal) throw new Error(`Interrupted by ${shutdownSignal}; benchmark aborted.`);
}

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

function loopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    requests: samples.length,
    p50_ms: Number(percentile(0.5).toFixed(2)),
    p95_ms: Number(percentile(0.95).toFixed(2)),
    p99_ms: Number(percentile(0.99).toFixed(2)),
  };
}

function generateRows(count) {
  const rows = new Array(count);
  for (let i = 1; i <= count; i += 1) {
    rows[i - 1] = {
      slug: `${PREFIX}-p-${String(i).padStart(5, "0")}`,
      name: `Benchmark Automation SaaS ${i}`,
      website_url: `https://product-${i}.example.test`,
      tagline: "Benchmark workflow automation for growing teams",
    };
  }
  return rows;
}

function run(command, args, env, { allowAfterInterrupt = false, binary = false } = {}) {
  if (shutdownSignal && !allowAfterInterrupt) {
    return Promise.reject(
      new Error(`Interrupted by ${shutdownSignal}; no further benchmark command will start.`),
    );
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;
    const isBoundedSqlExec =
      command === DOCKER &&
      args[0] === "exec" &&
      args.includes("timeout") &&
      (args.includes("psql") || args.includes("pgbench"));
    activeChildMayFinish = allowAfterInterrupt || isBoundedSqlExec;
    let stdout = "";
    const stdoutChunks = [];
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (activeChild === child) {
        activeChild = null;
        activeChildMayFinish = false;
      }
      callback(value);
    };
    if (binary)
      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(Buffer.from(chunk));
      });
    else
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
      });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (timedOut) {
        finish(
          reject,
          new Error(`${command} exceeded the ${COMMAND_TIMEOUT_MS} ms timeout and was terminated.`),
        );
      } else if (shutdownSignal && !allowAfterInterrupt) {
        finish(reject, new Error(`Interrupted by ${shutdownSignal}; ${command} was terminated.`));
      } else if (code === 0) {
        finish(resolvePromise, binary ? Buffer.concat(stdoutChunks) : stdout);
      } else {
        finish(reject, new Error(`${command} exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}

function dockerEnvironment() {
  if (process.env.DOCKER_HOST) {
    throw new Error(
      "Unset DOCKER_HOST; the active Docker context must resolve to a local Windows named pipe.",
    );
  }
  return { ...process.env };
}

async function assertLocalDockerContainer(dockerEnv) {
  const context = (await run(DOCKER, ["context", "show"], dockerEnv)).trim();
  if (!context) throw new Error("Docker did not report an active context.");
  const endpoint = (
    await run(
      DOCKER,
      ["context", "inspect", context, "--format", '{{(index .Endpoints "docker").Host}}'],
      dockerEnv,
    )
  ).trim();
  if (!endpoint.toLowerCase().startsWith("npipe://")) {
    throw new Error(
      `Refusing Docker endpoint '${endpoint}'; a local Windows named-pipe context is required.`,
    );
  }

  const inspectOutput = await run(
    DOCKER,
    ["inspect", "--format", "{{json .}}", DB_CONTAINER],
    dockerEnv,
  );
  let inspection;
  try {
    inspection = JSON.parse(inspectOutput);
  } catch {
    throw new Error("Docker returned invalid container inspection data.");
  }
  if (inspection.Name !== `/${DB_CONTAINER}` || inspection.State?.Running !== true) {
    throw new Error(`Expected running local container '${DB_CONTAINER}'.`);
  }
  return { context, endpoint, image: inspection.Config?.Image ?? "unknown" };
}

function psqlArgs(args) {
  return [
    "exec",
    "--user",
    "postgres",
    DB_CONTAINER,
    "timeout",
    "-s",
    "TERM",
    "-k",
    "5",
    String(CONTAINER_TIMEOUT_SECONDS),
    "psql",
    "-h",
    DB_SOCKET,
    "-p",
    DB_PORT,
    "-U",
    "postgres",
    "-d",
    "postgres",
    ...args,
  ];
}

function pgbenchArgs(args) {
  return [
    "exec",
    "--user",
    "postgres",
    DB_CONTAINER,
    "timeout",
    "-s",
    "TERM",
    "-k",
    "5",
    String(CONTAINER_TIMEOUT_SECONDS),
    "pgbench",
    "-h",
    DB_SOCKET,
    "-p",
    DB_PORT,
    "-U",
    "postgres",
    ...args,
    "postgres",
  ];
}

async function stageSqlFiles(dockerEnv) {
  const bundleHash = createHash("sha256");
  for (const localPath of SQL_FILES) {
    bundleHash.update(basename(localPath));
    bundleHash.update("\0");
    bundleHash.update(readFileSync(localPath));
    bundleHash.update("\0");
  }
  const bundleSha256 = bundleHash.digest("hex");
  const remoteDir = `/tmp/${PREFIX}-sql-${bundleSha256.slice(0, 16)}`;
  await run(DOCKER, ["exec", DB_CONTAINER, "mkdir", "-p", remoteDir], dockerEnv);

  const remoteFiles = new Map();
  for (const localPath of SQL_FILES) {
    const name = basename(localPath);
    const remotePath = `${remoteDir}/${name}`;
    const state = await run(
      DOCKER,
      [
        "exec",
        DB_CONTAINER,
        "sh",
        "-c",
        'if [ -f "$1" ]; then printf "present\\n"; cat "$1"; else printf "missing\\n"; fi',
        "sh",
        remotePath,
      ],
      dockerEnv,
    );
    const localSqlBytes = readFileSync(localPath);
    const localSql = localSqlBytes.toString("utf8");
    if (state.startsWith("present\n")) {
      if (state.slice("present\n".length) !== localSql) {
        throw new Error(`Refusing to overwrite unexpected container SQL file '${remotePath}'.`);
      }
    } else if (state === "missing\n") {
      await run(DOCKER, ["cp", localPath, `${DB_CONTAINER}:${remotePath}`], dockerEnv);
    } else {
      throw new Error(`Unexpected response while checking staged SQL file '${remotePath}'.`);
    }
    const transferredSql = await run(DOCKER, ["exec", DB_CONTAINER, "cat", remotePath], dockerEnv, {
      binary: true,
    });
    const localSha256 = createHash("sha256").update(localSqlBytes).digest("hex");
    const transferredSha256 = createHash("sha256").update(transferredSql).digest("hex");
    if (!transferredSql.equals(localSqlBytes) || transferredSha256 !== localSha256) {
      throw new Error(
        `Staged SQL integrity check failed for '${remotePath}': local SHA-256=${localSha256}, container SHA-256=${transferredSha256}.`,
      );
    }
    remoteFiles.set(localPath, remotePath);
  }
  return { dir: remoteDir, files: remoteFiles, bundle_sha256: bundleSha256 };
}

function makeJwt(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    aud: "authenticated",
    role: "authenticated",
    sub: randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  const message = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(message).digest("base64url");
  return `${message}.${signature}`;
}

async function benchmarkNodeGenerator(scale) {
  const samples = [];
  let jsonBytes = 0;
  let finalPayload = "";
  for (let round = 0; round < 6; round += 1) {
    const start = performance.now();
    const rows = generateRows(scale);
    const payload = JSON.stringify(rows);
    const elapsed = performance.now() - start;
    if (round > 0) samples.push(elapsed);
    jsonBytes = Buffer.byteLength(payload);
    finalPayload = payload;
    rows.length = 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const result = {
    scale,
    rows: scale,
    json_bytes: jsonBytes,
    dataset_sha256: createHash("sha256").update(finalPayload).digest("hex"),
    sample_count: samples.length,
    median_elapsed_ms: Number(medianMs.toFixed(2)),
    min_elapsed_ms: Number(sorted[0].toFixed(2)),
    max_elapsed_ms: Number(sorted.at(-1).toFixed(2)),
    rows_per_second_at_median: Math.round((scale * 1000) / medianMs),
  };
  return result;
}

async function benchmarkSupabaseApi(scale, baseUrl, publishableKey, jwtSecret, concurrency) {
  const jwt = makeJwt(jwtSecret);
  const url = new URL("/rest/v1/saas_products", baseUrl);
  url.searchParams.set("select", "id,name");
  url.searchParams.set("slug", `like.${PREFIX}-p-*`);
  url.searchParams.set("order", "slug.asc");
  const headers = {
    apikey: publishableKey,
    authorization: `Bearer ${jwt}`,
    accept: "application/json",
    range: "0-29",
    "cache-control": "no-cache",
  };
  const fetchOne = async () => {
    const start = performance.now();
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.any([AbortSignal.timeout(10_000), shutdownController.signal]),
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(`Supabase REST returned ${response.status}: ${text.slice(0, 300)}`);
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length !== Math.min(30, scale)) {
      throw new Error(
        `Supabase REST returned ${Array.isArray(rows) ? rows.length : "non-array"} rows; expected ${Math.min(30, scale)}.`,
      );
    }
    return performance.now() - start;
  };

  for (let i = 0; i < 10; i += 1) await fetchOne();
  const samples = [];
  const target = 100;
  const runStart = performance.now();
  for (let done = 0; done < target; done += concurrency) {
    const count = Math.min(concurrency, target - done);
    samples.push(...(await Promise.all(Array.from({ length: count }, fetchOne))));
  }
  const elapsedMs = performance.now() - runStart;
  return {
    scale,
    concurrency,
    ...summarize(samples),
    elapsed_ms: Number(elapsedMs.toFixed(2)),
    requests_per_second: Number(((target * 1000) / elapsedMs).toFixed(2)),
  };
}

async function verifySupabaseCount(scale, baseUrl, publishableKey, jwtSecret) {
  const url = new URL("/rest/v1/saas_products", baseUrl);
  url.searchParams.set("select", "id");
  url.searchParams.set("slug", `like.${PREFIX}-p-*`);
  const response = await fetch(url, {
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${makeJwt(jwtSecret)}`,
      accept: "application/json",
      prefer: "count=exact",
      range: "0-0",
    },
    signal: AbortSignal.any([AbortSignal.timeout(10_000), shutdownController.signal]),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Supabase REST preflight returned ${response.status}: ${body.slice(0, 300)}`);
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  if (total !== scale)
    throw new Error(`Supabase REST exposed ${total} fixture rows; expected ${scale}.`);
  return total;
}

function parsePgbench(output, scale, clients, query) {
  const processed = output.match(/number of transactions actually processed:\s*(\d+)\/(\d+)/i);
  const failed = output.match(/number of failed transactions:\s*(\d+)/i);
  const latency = output.match(/latency average\s*=\s*([\d.]+)\s*ms/i);
  const deviation = output.match(/latency stddev\s*=\s*([\d.]+)\s*ms/i);
  const tps = output.match(/tps\s*=\s*([\d.]+)/i);
  if (!processed || !failed || !latency || !tps) {
    throw new Error(`Could not parse pgbench output:\n${output}`);
  }
  return {
    scale,
    clients,
    query,
    transactions_completed: Number(processed[1]),
    transactions_expected: Number(processed[2]),
    failed_transactions: Number(failed[1]),
    average_latency_ms: Number(latency[1]),
    latency_stddev_ms: deviation ? Number(deviation[1]) : null,
    transactions_per_second: Number(tps[1]),
  };
}

async function main() {
  const nodeOnly = process.argv.includes("--node-only");
  const requiredNode = readFileSync(resolve(ROOT, ".nvmrc"), "utf8").trim();
  if (process.versions.node !== requiredNode) {
    throw new Error(
      `Use Node ${requiredNode} from .nvmrc for reproducible measurements; found ${process.version}.`,
    );
  }
  const nodeResults = [];
  for (const scale of SCALES) nodeResults.push(await benchmarkNodeGenerator(scale));
  throwIfInterrupted();
  if (nodeOnly) {
    process.stdout.write(
      `${JSON.stringify(
        {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          cpu_count: cpus().length,
          system_memory_bytes: totalmem(),
          node_generator: nodeResults,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const dockerEnv = dockerEnvironment();
  const dockerTarget = await assertLocalDockerContainer(dockerEnv);
  const stagedSql = await stageSqlFiles(dockerEnv);
  const pgResults = [];
  const seedResults = [];
  const fixtureChecks = [];
  const apiCountChecks = [];
  const cleanupResults = [];
  const isolationChecks = [];
  const apiResults = [];
  let reproducibilityHash = null;
  const apiUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const runApi = Boolean(apiUrl && publishableKey && jwtSecret);
  if (apiUrl) {
    const parsedApiUrl = new URL(apiUrl);
    if (
      parsedApiUrl.protocol !== "http:" ||
      !loopbackHostname(parsedApiUrl.hostname) ||
      parsedApiUrl.port !== "54321"
    ) {
      throw new Error("Refusing SUPABASE_URL outside local HTTP at port 54321.");
    }
  }
  if (Boolean(apiUrl || publishableKey || jwtSecret) && !runApi) {
    throw new Error(
      "For the Supabase REST benchmark, provide SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_JWT_SECRET together.",
    );
  }
  if (!runApi && !process.argv.includes("--postgres-only")) {
    throw new Error(
      "The full run requires local Supabase API credentials; use --postgres-only to explicitly skip PostgREST.",
    );
  }

  const psqlVersion = await run(DOCKER, psqlArgs(["--version"]), dockerEnv);
  const pgbenchVersion = await run(DOCKER, pgbenchArgs(["--version"]), dockerEnv);
  if (!/\b17\.\d+/.test(psqlVersion) || !/\b17\.\d+/.test(pgbenchVersion)) {
    throw new Error(
      `PostgreSQL 17 client tools are required; psql=${psqlVersion.trim()}, pgbench=${pgbenchVersion.trim()}.`,
    );
  }
  const serverVersion = await run(
    DOCKER,
    psqlArgs([
      "-X",
      "-qAt",
      "-c",
      "select current_setting('server_version') || '|' || current_setting('server_version_num')",
    ]),
    dockerEnv,
  );
  const [serverVersionText, serverVersionNum] = serverVersion.trim().split("|");
  if (!/^17\.\d+/.test(serverVersionText) || !/^17\d{4}$/.test(serverVersionNum)) {
    throw new Error(
      `PostgreSQL 17 server required; server_version=${serverVersionText}, server_version_num=${serverVersionNum}.`,
    );
  }
  const clean = async ({ allowAfterInterrupt = false } = {}) => {
    const output = await run(
      DOCKER,
      psqlArgs(["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", stagedSql.files.get(CLEANUP_SQL)]),
      dockerEnv,
      { allowAfterInterrupt },
    );
    const lines = output.trim().split(/\r?\n/);
    if (lines.length !== 3 || !/^\d+$/.test(lines[0]) || !/^\d+$/.test(lines[1])) {
      throw new Error(`Could not verify local fixture cleanup: ${output}`);
    }
    const remaining = lines[2].split("|").map(Number);
    const deletedProducts = Number(lines[0]);
    const deletedCompanies = Number(lines[1]);
    if (remaining.length !== 2 || remaining.some((value) => !Number.isInteger(value))) {
      throw new Error(`Could not verify local fixture cleanup: ${output}`);
    }
    if (remaining[0] !== 0 || remaining[1] !== 0)
      throw new Error("Benchmark fixture rows remain after cleanup.");
    return {
      deleted_products: deletedProducts,
      deleted_companies: deletedCompanies,
      remaining_products: remaining[0],
      remaining_companies: remaining[1],
    };
  };
  const outsidePrefixFingerprint = async ({ allowAfterInterrupt = false } = {}) => {
    const output = await run(
      DOCKER,
      psqlArgs(["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", stagedSql.files.get(BOUNDARY_SQL)]),
      dockerEnv,
      { allowAfterInterrupt },
    );
    const lines = output
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("|"));
    if (
      lines.length !== 2 ||
      lines.some(
        (line) => line.length !== 2 || !/^\d+$/.test(line[0]) || !/^[a-f0-9]{32}$/.test(line[1]),
      )
    ) {
      throw new Error(`Could not verify non-fixture row counts: ${output}`);
    }
    return lines.map(([count, hash]) => [Number(count), hash]);
  };

  const baselineOutsidePrefix = await outsidePrefixFingerprint();
  const initialCleanup = await clean(); // Also remove an interrupted run's reserved fixture namespace.
  const outsideImmediatelyAfterInitialCleanup = await outsidePrefixFingerprint({
    allowAfterInterrupt: true,
  });
  if (
    JSON.stringify(outsideImmediatelyAfterInitialCleanup) !== JSON.stringify(baselineOutsidePrefix)
  ) {
    throw new Error(
      `Initial cleanup changed rows outside the fixture prefixes: before=${JSON.stringify(baselineOutsidePrefix)}; after=${JSON.stringify(outsideImmediatelyAfterInitialCleanup)}`,
    );
  }
  cleanupResults.push({ phase: "initial", ...initialCleanup });
  isolationChecks.push({
    phase: "initial_cleanup",
    outside_prefix_row_fingerprints_unchanged: true,
  });
  if (shutdownSignal)
    throw new Error(
      `Interrupted by ${shutdownSignal}; benchmark aborted after initial cleanup verification.`,
    );

  for (const scale of SCALES) {
    let seedAttempted = false;
    let runError;
    try {
      const seedStart = performance.now();
      seedAttempted = true;
      await run(
        DOCKER,
        psqlArgs([
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-v",
          `scale=${scale}`,
          "-f",
          stagedSql.files.get(SEED_SQL),
        ]),
        dockerEnv,
      );
      const seedMs = performance.now() - seedStart;
      seedResults.push({ scale, elapsed_ms: Number(seedMs.toFixed(2)) });

      const inspectOutput = await run(
        DOCKER,
        psqlArgs([
          "-X",
          "-qAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-v",
          `scale=${scale}`,
          "-f",
          stagedSql.files.get(INSPECT_SQL),
        ]),
        dockerEnv,
      );
      const [rowCount, uniqueSlugCount, fullHash, firstTwoThousandHash] = inspectOutput
        .trim()
        .split("|");
      if (
        Number(rowCount) !== scale ||
        Number(uniqueSlugCount) !== scale ||
        !fullHash ||
        !firstTwoThousandHash
      ) {
        throw new Error(`Fixture count/hash verification failed at ${scale}: ${inspectOutput}`);
      }
      if (scale === 2_000) reproducibilityHash = firstTwoThousandHash;
      else if (firstTwoThousandHash !== reproducibilityHash) {
        throw new Error(`The first 2K fixture checksum changed at scale ${scale}.`);
      }
      fixtureChecks.push({
        scale,
        rows: Number(rowCount),
        unique_slugs: Number(uniqueSlugCount),
        content_checksum: fullHash,
        first_2k_checksum: firstTwoThousandHash,
      });

      for (const clients of CLIENTS) {
        for (const [query, sql] of [
          ["page", READ_SQL],
          ["count", COUNT_SQL],
        ]) {
          const output = await run(
            DOCKER,
            pgbenchArgs([
              "-n",
              "-M",
              "simple",
              "-f",
              stagedSql.files.get(sql),
              "-c",
              String(clients),
              "-j",
              String(Math.min(clients, 4)),
              "-t",
              String(TRANSACTIONS_PER_CLIENT),
              "-r",
            ]),
            dockerEnv,
          );
          pgResults.push(parsePgbench(output, scale, clients, query));
        }
      }
      if (runApi) {
        const exposedRows = await verifySupabaseCount(scale, apiUrl, publishableKey, jwtSecret);
        apiCountChecks.push({ scale, exposed_rows: exposedRows });
        for (const concurrency of CLIENTS) {
          apiResults.push(
            await benchmarkSupabaseApi(scale, apiUrl, publishableKey, jwtSecret, concurrency),
          );
        }
      }
    } catch (error) {
      runError = error;
    } finally {
      if (seedAttempted) {
        try {
          cleanupResults.push({ scale, ...(await clean({ allowAfterInterrupt: true })) });
          const outsideAfter = await outsidePrefixFingerprint({ allowAfterInterrupt: true });
          if (JSON.stringify(outsideAfter) !== JSON.stringify(baselineOutsidePrefix)) {
            throw new Error(
              `Non-fixture row fingerprints changed: before=${JSON.stringify(baselineOutsidePrefix)}; after=${JSON.stringify(outsideAfter)}`,
            );
          }
          isolationChecks.push({ scale, outside_prefix_row_fingerprints_unchanged: true });
        } catch (error) {
          runError = runError
            ? new AggregateError(
                [runError, error],
                "Benchmark failed and fixture cleanup/isolation verification also failed.",
              )
            : error;
        }
      }
    }
    if (runError) throw runError;
    throwIfInterrupted();
  }

  throwIfInterrupted();
  process.stdout.write(
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu_count: cpus().length,
        system_memory_bytes: totalmem(),
        scales: SCALES,
        synthetic_prefix: PREFIX,
        database: {
          docker_context: dockerTarget.context,
          docker_endpoint: dockerTarget.endpoint,
          container: DB_CONTAINER,
          image: dockerTarget.image,
          server_version: serverVersionText,
          psql_version: psqlVersion.trim(),
          pgbench_version: pgbenchVersion.trim(),
          connection: `unix socket ${DB_SOCKET}:${DB_PORT}, database postgres, role postgres`,
          staged_sql_bundle_sha256: stagedSql.bundle_sha256,
        },
        verification: {
          fixture_counts_and_uniqueness: fixtureChecks,
          first_2k_content_checksum_stable_across_scales: true,
          postgrest_visible_row_counts: apiCountChecks,
          cleanup: cleanupResults,
          non_fixture_counts_unchanged: isolationChecks,
        },
        seed_and_analyze: seedResults,
        node_generator: nodeResults,
        postgresql_pgbench: pgResults,
        supabase_postgrest: runApi ? apiResults : "explicitly skipped with --postgres-only",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
