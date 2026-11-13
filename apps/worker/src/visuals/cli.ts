// Visual references CLI (PD-38, amendment of ADR-016).
//
//   node dist-visuals/visuals.js collect licensed|publisher <out.json> <catalog snapshot>…
//   node dist-visuals/visuals.js collect official <publisher.json> <site.json> <catalog snapshot>…
//     (one visit per official site: share image + hero or screenshot, PD-38/PD-40)
//     Runs in the Catalog visuals workflow (GitHub runners). No database, no secret.
//   node dist-visuals/visuals.js refine <site.json>
//     Re-applies the offline relevance rules (visref-2) to a site snapshot, in place.
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node dist-visuals/visuals.js ingest <snapshot.json>…
//     Then retires the references that do not show a product (visref-2: the same
//     image on several products, builder defaults, stock photos).
//     Loads references into the database the environment points at (a hosted
//     project only on the product owner's go-ahead, docs/DEPLOYMENT.md).
//
// Prints a JSON summary; `ingest` exits 1 when a reference could not be written.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CatalogSnapshotSchema,
  VisualReferenceSnapshotSchema,
  type CatalogListing,
} from "@sor/contracts";
import { createServiceClient, discoverAssetsRepo } from "@sor/database";
import { commonsHttpGetter, wikidataHttpRunner } from "@sor/data-sources";
import {
  collectLicensed,
  collectOfficial,
  collectPublisher,
  liveOfficialVisualsCollector,
  liveShareImageCollector,
} from "./collect";
import { ingestVisualReferences } from "./ingest";
import { refineSiteSnapshot } from "./refine";

const [command, ...args] = process.argv.slice(2);
const log = (line: string) => process.stderr.write(`${line}\n`);
const usage =
  "usage: visuals.js collect licensed|publisher <out.json> <catalog snapshot>… | collect official <publisher.json> <site.json> <catalog snapshot>… | refine <site.json> | ingest <snapshot.json>…\n";

async function readListings(files: string[]): Promise<CatalogListing[]> {
  const listings: CatalogListing[] = [];
  for (const file of files) {
    const snapshot = CatalogSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
    listings.push(...snapshot.listings);
  }
  return listings;
}

async function writeSnapshot(out: string, snapshot: unknown): Promise<void> {
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 1)}\n`);
}

if (command === "refine") {
  const [file] = args;
  if (!file) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const before = VisualReferenceSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const after = refineSiteSnapshot(before);
  process.stdout.write(
    `${JSON.stringify({ file, before: before.summary.references, after: after.summary.references }, null, 2)}\n`,
  );
  await writeSnapshot(file, after);
} else if (command === "collect" && args[0] === "official") {
  const [, publisherOut, siteOut, ...inputs] = args;
  if (!publisherOut || !siteOut || inputs.length === 0) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const listings = await readListings(inputs);
  const { publisher, site } = await collectOfficial({
    listings,
    collect: liveOfficialVisualsCollector(),
    log,
  });
  process.stdout.write(
    `${JSON.stringify({ publisher: publisher.summary, site: site.summary }, null, 2)}\n`,
  );
  await writeSnapshot(publisherOut, publisher);
  await writeSnapshot(siteOut, refineSiteSnapshot(site));
} else if (command === "collect") {
  const [kind, out, ...inputs] = args;
  if ((kind !== "licensed" && kind !== "publisher") || !out || inputs.length === 0) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const listings = await readListings(inputs);
  const snapshot =
    kind === "licensed"
      ? await collectLicensed({
          listings,
          run: wikidataHttpRunner(),
          get: commonsHttpGetter(),
          pauseMs: 1_000,
          log,
        })
      : await collectPublisher({ listings, collect: liveShareImageCollector(), log });
  process.stdout.write(`${JSON.stringify({ kind, out, ...snapshot.summary }, null, 2)}\n`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 1)}\n`);
} else if (command === "ingest") {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey || args.length === 0) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const db = createServiceClient({ url, secretKey });
  let failed = 0;
  for (const file of args) {
    const snapshot = VisualReferenceSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
    const started = Date.now();
    const summary = await ingestVisualReferences(db, snapshot, { log });
    failed += summary.statuses.error ?? 0;
    process.stdout.write(
      `${JSON.stringify({ file, duration_ms: Date.now() - started, ...summary }, null, 2)}\n`,
    );
  }
  const retired = await discoverAssetsRepo.retireGenericVisualReferences(db);
  process.stdout.write(`${JSON.stringify({ generic_references_retired: retired }, null, 2)}\n`);
  process.exit(failed > 0 ? 1 : 0);
} else {
  process.stderr.write(usage);
  process.exit(2);
}
