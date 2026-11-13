// Catalog ingestion CLI: loads collected snapshot files into the database
// the environment points at (local stack in development and CI; a hosted
// project only on the product owner's explicit go-ahead, docs/DEPLOYMENT.md).
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node dist-catalog/ingest.js data/catalog/wikidata/listings.json
//
// Prints a JSON summary; exits 1 when a listing could not be written.
import { readFile } from "node:fs/promises";
import { CatalogSnapshotSchema } from "@sor/contracts";
import { createServiceClient, pipelineRepo } from "@sor/database";
import { ingestListings } from "./ingest";

const files = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (files.length === 0 || !url || !secretKey) {
  process.stderr.write("usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… ingest.js <snapshot.json>…\n");
  process.exit(2);
}

const db = createServiceClient({ url, secretKey });
let failed = 0;
for (const file of files) {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  // The envelope is validated; listings are validated one by one by the ingester.
  const envelope = CatalogSnapshotSchema.omit({ listings: true }).passthrough().parse(raw) as {
    source_key: string;
    listings?: unknown;
  };
  const listings = Array.isArray(envelope.listings) ? envelope.listings : [];
  // A source not enabled in this environment is never loaded (PD-42: Hacker
  // News is enabled in production only; CI and local stacks keep it off).
  if (!(await pipelineRepo.sourceIsEnabled(db, envelope.source_key))) {
    process.stdout.write(
      `${JSON.stringify({ file, source_key: envelope.source_key, total: listings.length, skipped: "source_not_enabled" }, null, 2)}\n`,
    );
    continue;
  }
  const started = Date.now();
  const summary = await ingestListings(db, listings, {
    sourceKey: envelope.source_key,
    log: (line) => process.stderr.write(`${line}\n`),
  });
  failed += summary.counts.error;
  process.stdout.write(
    `${JSON.stringify({ file, duration_ms: Date.now() - started, ...summary }, null, 2)}\n`,
  );
}
// A bulk load leaves the planner with the statistics of a much smaller
// catalog until autovacuum runs: Discover then times out (measured 24.7 s at
// ~8,500 products). Refresh them now.
const analyzed = Date.now();
await pipelineRepo.refreshCatalogStatistics(db);
process.stderr.write(`catalog statistics refreshed in ${Date.now() - analyzed} ms\n`);
process.exit(failed > 0 ? 1 : 0);
