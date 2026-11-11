import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node26",
  sourcemap: true,
  clean: true,
  // Workspace packages export TypeScript source: bundle them.
  noExternal: [/^@sor\//],
});
