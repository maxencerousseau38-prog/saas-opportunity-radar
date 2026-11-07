// F13 test child (S7.5b): one self-contained ESM file, like the container
// bundle, so the SIGTERM scenario runs the real process lifecycle with Node.js
// only. Output in dist/ (ignored by git).
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "sigterm-child": "test/resilience/sigterm-child.ts" },
  outDir: "dist/resilience",
  format: ["esm"],
  platform: "node",
  target: "node26",
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  banner: {
    js: 'import { createRequire as __sorCreateRequire } from "node:module"; const require = __sorCreateRequire(import.meta.url);',
  },
});
