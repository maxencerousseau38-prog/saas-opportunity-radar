import { defineConfig } from "tsup";

// Evaluation tooling (evals/README.md): built separately from the worker.
export default defineConfig({
  entry: { snapshot: "src/evals/snapshot.ts" },
  outDir: "dist-evals",
  format: ["esm"],
  platform: "node",
  target: "node26",
  clean: true,
  noExternal: [/^@sor\//],
});
