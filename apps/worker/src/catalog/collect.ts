// Catalog collection CLI (first bulk collection, 10 November 2026). Runs in
// the "Catalog collection" workflow (GitHub runners: this session's network
// policy blocks the sources) and writes a normalized snapshot file that the
// ingester loads into the catalog. No database access, no secret.
//
//   node dist-catalog/collect.js wikidata <out.json>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectWikidata, wikidataHttpRunner } from "@sor/data-sources";

const [source, out] = process.argv.slice(2);
if (source !== "wikidata" || !out) {
  process.stderr.write("usage: collect.js wikidata <out.json>\n");
  process.exit(2);
}

const snapshot = await collectWikidata({ run: wikidataHttpRunner(), pauseMs: 5_000 });
for (const q of snapshot.queries) {
  process.stdout.write(`${q.key}: ${q.status} ${q.rows} rows${q.error ? ` (${q.error})` : ""}\n`);
}
process.stdout.write(`listings: ${snapshot.listings.length}\n`);
if (snapshot.listings.length === 0) {
  process.stderr.write("no listing collected: snapshot not written\n");
  process.exit(1);
}
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(snapshot, null, 1)}\n`);
