// Container bundle (Sprint 7, PD-27): one self-contained ESM file with every
// dependency inlined, so the runtime image needs Node.js only (no
// node_modules, no pnpm). CommonJS dependencies get a `require` shim.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts" },
  outDir: "dist-container",
  format: ["esm"],
  platform: "node",
  target: "node26",
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  banner: {
    js: 'import { createRequire as __sorCreateRequire } from "node:module"; const require = __sorCreateRequire(import.meta.url);',
  },
});
