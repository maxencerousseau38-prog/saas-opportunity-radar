import { defineConfig } from "tsup";

// Product visuals CLI (ADR-016, docs/DATA_SOURCES.md "Product visuals"),
// built separately from the worker like the catalog tooling.
export default defineConfig({
  entry: { assets: "src/assets/cli.ts" },
  outDir: "dist-assets",
  format: ["esm"],
  platform: "node",
  target: "node26",
  clean: true,
  noExternal: [/^@sor\//],
});
