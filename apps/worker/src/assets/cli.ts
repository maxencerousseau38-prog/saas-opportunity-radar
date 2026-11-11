// Product visuals CLI (ADR-016, S8.3). Run by the platform operator from a
// trusted machine, against the database the environment points at (local
// stack; a hosted project only on the product owner's go-ahead).
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… SOR_OPERATOR_ID=<operator user id> \
//     node dist-assets/assets.js admit manifest.json
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node dist-assets/assets.js revalidate
//
// The manifest (visual-assets-1) names each image with its documented rights;
// prints a JSON summary; exits 1 when an entry was refused.
import { readFile } from "node:fs/promises";
import { VisualAssetManifestSchema } from "@sor/contracts";
import { createServiceClient } from "@sor/database";
import { fetchVisualAsset, imagePolicy } from "@sor/data-sources";
import { admitAssets, revalidateAssets, type FetchImage } from "./admit";

const [command, file] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const operator = process.env.SOR_OPERATOR_ID;
const usage =
  "usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… [SOR_OPERATOR_ID=…] assets.js admit <manifest.json> | revalidate\n";
if (!url || !secretKey || (command !== "admit" && command !== "revalidate")) {
  process.stderr.write(usage);
  process.exit(2);
}

const db = createServiceClient({ url, secretKey });
const policy = imagePolicy();
const fetchImage: FetchImage = (imageUrl) =>
  fetchVisualAsset(imageUrl, policy, AbortSignal.timeout(30_000));
const log = (line: string) => process.stderr.write(`${line}\n`);

if (command === "admit") {
  if (!file || !operator) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const manifest = VisualAssetManifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const results = await admitAssets(db, manifest, { operator, fetchImage, log });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.exit(results.some((r) => r.status === "refused") ? 1 : 0);
} else {
  const results = await revalidateAssets(db, { fetchImage, log });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.exit(0);
}
