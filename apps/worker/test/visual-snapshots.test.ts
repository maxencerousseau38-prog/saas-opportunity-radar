// S8.5 (PD-38): the committed visual reference snapshots
// (data/visuals/<kind>.json) are validated on every CI run before anything is
// loaded from them: contract, kind, one reference per listing, no duplicate.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VisualReferenceSnapshotSchema } from "@sor/contracts";

const VISUALS_DIR = resolve(__dirname, "../../../data/visuals");
const files = existsSync(VISUALS_DIR)
  ? readdirSync(VISUALS_DIR).filter((f) => f.endsWith(".json"))
  : [];

describe("committed visual reference snapshots", () => {
  it("are named after their kind", () => {
    for (const f of files) expect(["licensed.json", "publisher.json", "site.json"]).toContain(f);
  });

  describe.each(files.length ? files : ["(none yet)"])("%s", (file) => {
    it.skipIf(!files.length)("follows the contract, one reference per listing", () => {
      const snapshot = VisualReferenceSnapshotSchema.parse(
        JSON.parse(readFileSync(join(VISUALS_DIR, file), "utf8")),
      );
      expect(`${snapshot.kind}.json`).toBe(file);
      expect(snapshot.summary.references).toBe(snapshot.references.length);
      for (const r of snapshot.references) {
        if (snapshot.kind === "site") expect(["site_hero", "site_screenshot"]).toContain(r.kind);
        else expect(r.kind).toBe(snapshot.kind);
      }
      // visref-2: an image shown by two different products is a template.
      if (snapshot.rules_version !== "visref-1") {
        const owners = new Map<string, Set<string>>();
        for (const r of snapshot.references) {
          const host = new URL(r.page_url).hostname.replace(/^www\./, "");
          owners.set(r.content_hash, (owners.get(r.content_hash) ?? new Set()).add(host));
        }
        for (const [, hosts] of owners) expect(hosts.size).toBeLessThanOrEqual(2);
      }
      const keys = snapshot.references.map(
        (r) => `${r.listing_source_key}:${r.listing_external_id}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
