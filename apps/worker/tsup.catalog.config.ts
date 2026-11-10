import { defineConfig } from "tsup";

// Catalog collection and ingestion CLIs (docs/DATA_SOURCES.md), built
// separately from the worker like the evaluation tooling.
export default defineConfig({
  entry: { collect: "src/catalog/collect.ts" },
  outDir: "dist-catalog",
  format: ["esm"],
  platform: "node",
  target: "node26",
  clean: true,
  noExternal: [/^@sor\//],
});
