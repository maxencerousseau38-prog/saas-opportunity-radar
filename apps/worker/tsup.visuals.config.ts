import { defineConfig } from "tsup";

// Visual references CLI (PD-38, docs/DATA_SOURCES.md "Product visuals"),
// built separately from the worker like the catalog tooling.
export default defineConfig({
  entry: { visuals: "src/visuals/cli.ts" },
  outDir: "dist-visuals",
  format: ["esm"],
  platform: "node",
  target: "node26",
  clean: true,
  noExternal: [/^@sor\//],
});
