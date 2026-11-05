// Freezes the inputs of the PD-24 benchmark (evals/README.md):
//   sites <sites.json> <outDir>  — official pages of each evaluation site, fetched with the
//                                  production connector and page selection, one JSON per site;
//   docs  <docs.json>  <outDir>  — official vendor pricing/model pages (text + gzipped HTML).
// Run by .github/workflows/eval-snapshot.yml. Existing snapshots are never overwritten
// (frozen inputs) unless EVAL_SNAPSHOT_FORCE=1. No AI call, no database access.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  extractPage,
  isAllowed,
  OfficialWebsiteConnector,
  parseRobots,
  defaultPolicy,
  safeFetch,
  selectEnrichmentPages,
  type SafeFetchPolicy,
} from "@sor/data-sources";

const FORCE = process.env.EVAL_SNAPSHOT_FORCE === "1";
const log = (line: string) => process.stdout.write(`${line}\n`);

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

interface SiteEntry {
  id: string;
  url: string;
  segment: string;
  expected_exclusion: string;
}

async function snapshotSites(file: string, outDir: string): Promise<void> {
  const config = JSON.parse(await readFile(file, "utf8")) as {
    max_pages_per_site: number;
    sites: SiteEntry[];
  };
  await mkdir(outDir, { recursive: true });
  const connector = new OfficialWebsiteConnector({ policy: defaultPolicy() });
  for (const site of config.sites) {
    const target = path.join(outDir, `${site.id}.json`);
    if (!FORCE && (await exists(target))) {
      log(`skip ${site.id} (frozen)`);
      continue;
    }
    const signal = AbortSignal.timeout(120_000);
    const pages: unknown[] = [];
    const failures: unknown[] = [];
    let homeLinks: string[] = [];
    const home = await connector.fetchDocument(site.url, signal);
    if (home.status === "ok") {
      homeLinks = Array.isArray(home.data.metadata.links)
        ? (home.data.metadata.links as string[])
        : [];
      pages.push({ requested_url: site.url, ...pageOf(home.data) });
      for (const url of selectEnrichmentPages(home.data, config.max_pages_per_site - 1)) {
        const res = await connector.fetchDocument(url, signal);
        if (res.status === "ok") pages.push({ requested_url: url, ...pageOf(res.data) });
        else failures.push({ url, status: res.status, reason: res.reason });
      }
    } else {
      failures.push({ url: site.url, status: home.status, reason: home.reason });
    }
    const snapshot = {
      id: site.id,
      url: site.url,
      segment: site.segment,
      retrieved_at: new Date().toISOString(),
      connector: "official_website (production connector, robots.txt obeyed)",
      home_links: homeLinks,
      pages,
      failures,
    };
    await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`${site.id}: ${pages.length} page(s), ${failures.length} failure(s)`);
  }
}

function pageOf(doc: {
  canonical_url: string;
  title: string | null;
  text: string;
  content_hash: string;
  http_status: number | null;
  retrieved_at: string;
}) {
  return {
    canonical_url: doc.canonical_url,
    title: doc.title,
    http_status: doc.http_status,
    retrieved_at: doc.retrieved_at,
    content_hash: doc.content_hash,
    chars: doc.text.length,
    text: doc.text,
  };
}

async function robotsAllow(url: URL, policy: SafeFetchPolicy): Promise<boolean> {
  const res = await safeFetch(
    `${url.origin}/robots.txt`,
    { ...policy, allowedContentTypes: ["text/plain", "text/html", ""] },
    AbortSignal.timeout(20_000),
  );
  if (res.status !== "ok") return true; // no readable robots.txt: allowed (as the connector)
  return isAllowed(
    parseRobots(res.data.body, "SaaSOpportunityRadar"),
    `${url.pathname}${url.search}`,
  );
}

async function snapshotDocs(file: string, outDir: string): Promise<void> {
  const config = JSON.parse(await readFile(file, "utf8")) as {
    pages: Array<{ vendor: string; url: string }>;
  };
  await mkdir(outDir, { recursive: true });
  const policy = defaultPolicy({ maxBytes: 15 * 1024 * 1024, timeoutMs: 30_000 });
  const indexFile = path.join(outDir, "index.json");
  const previous = (await exists(indexFile))
    ? (JSON.parse(await readFile(indexFile, "utf8")) as Array<{ url: string; status: string }>)
    : [];
  const index: unknown[] = [];
  for (const page of config.pages) {
    const frozen = previous.find((p) => p.url === page.url && p.status === "ok");
    if (frozen && !FORCE) {
      index.push(frozen); // already snapshotted: kept as read
      continue;
    }
    const url = new URL(page.url);
    const slug = `${page.vendor}--${`${url.host}${url.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
    const retrievedAt = new Date().toISOString();
    if (!(await robotsAllow(url, policy))) {
      index.push({ ...page, retrieved_at: retrievedAt, status: "robots_disallow" });
      log(`${slug}: robots_disallow`);
      continue;
    }
    const res = await safeFetch(page.url, policy, AbortSignal.timeout(60_000));
    if (res.status !== "ok") {
      index.push({ ...page, retrieved_at: retrievedAt, status: res.status, reason: res.reason });
      log(`${slug}: ${res.status} ${res.reason}`);
      continue;
    }
    const text = extractPage(res.data.body, res.data.finalUrl).text;
    await writeFile(path.join(outDir, `${slug}.txt`), `${page.url}\n${retrievedAt}\n\n${text}\n`);
    await writeFile(path.join(outDir, `${slug}.html.gz`), gzipSync(res.data.body));
    index.push({
      ...page,
      final_url: res.data.finalUrl,
      retrieved_at: retrievedAt,
      status: "ok",
      http_status: res.data.status,
      text_chars: text.length,
      html_bytes: res.data.body.length,
      file: `${slug}.txt`,
    });
    log(`${slug}: ok (${text.length} chars text)`);
  }
  await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
}

const [mode, input, outDir] = process.argv.slice(2);
if (!input || !outDir || (mode !== "sites" && mode !== "docs")) {
  process.stderr.write("usage: snapshot.js sites|docs <input.json> <outDir>\n");
  process.exit(2);
}
await (mode === "sites" ? snapshotSites(input, outDir) : snapshotDocs(input, outDir));
