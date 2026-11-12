// Visual references CLI (PD-38, amendment of ADR-016).
//
//   node dist-visuals/visuals.js collect licensed|publisher <out.json> <catalog snapshot>…
//     Runs in the Catalog visuals workflow (GitHub runners). No database, no secret.
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node dist-visuals/visuals.js ingest <snapshot.json>…
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
import { createServiceClient } from "@sor/database";
import { commonsHttpGetter, wikidataHttpRunner } from "@sor/data-sources";
import { collectLicensed, collectPublisher, liveShareImageCollector } from "./collect";
import { ingestVisualReferences } from "./ingest";

const [command, ...args] = process.argv.slice(2);
const log = (line: string) => process.stderr.write(`${line}\n`);
const usage =
  "usage: visuals.js collect licensed|publisher <out.json> <catalog snapshot>… | ingest <snapshot.json>…\n";

async function readListings(files: string[]): Promise<CatalogListing[]> {
  const listings: CatalogListing[] = [];
  for (const file of files) {
    const snapshot = CatalogSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
    listings.push(...snapshot.listings);
  }
  return listings;
}

if (command === "collect") {
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
  process.exit(failed > 0 ? 1 : 0);
} else {
  process.stderr.write(usage);
  process.exit(2);
}
