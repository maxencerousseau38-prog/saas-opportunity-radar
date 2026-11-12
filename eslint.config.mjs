// Root ESLint flat config. Enforces the package boundaries of
// docs/IMPLEMENTATION_BLUEPRINT.md §1 ("Package boundaries").
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const ENGINES = ["@sor/discovery-engine", "@sor/pain-point-engine", "@sor/opportunity-engine"];
const NETWORK = ["node:http", "node:https", "node:net", "node:dns", "node:child_process", "undici"];

/** Forbid importing the listed modules from the files of one package. */
const boundary = (files, groups, message) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: [{ group: groups, message }] }],
  },
});

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-evals/**",
      "**/dist-container/**",
      "**/dist-catalog/**",
      "**/dist-assets/**",
      "**/dist-visuals/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/next-env.d.ts",
      "packages/database/src/generated.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // --- Package boundaries -------------------------------------------------
  boundary(
    ["packages/contracts/**"],
    ["@sor/*", "@supabase/*", ...NETWORK],
    "contracts: Zod schemas only — no database, provider, network or other workspace imports.",
  ),
  {
    files: ["packages/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@supabase/*",
                "@sor/database",
                "@sor/data-sources",
                "@sor/ai-gateway",
                ...ENGINES,
                ...NETWORK,
              ],
              message:
                "domain: deterministic rules only — no I/O, Supabase, AI SDK or engine imports.",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "domain: no network access." }],
    },
  },
  boundary(
    ["packages/database/**"],
    ["@sor/data-sources", "@sor/ai-gateway", ...ENGINES],
    "database: clients and repositories only — no business orchestration.",
  ),
  boundary(
    ["packages/data-sources/**"],
    ["@sor/database", "@supabase/*", "@sor/ai-gateway", ...ENGINES],
    "data-sources: connectors never write to the catalog (no database imports).",
  ),
  boundary(
    ["packages/ai-gateway/**"],
    ["@sor/database", "@supabase/*", "@sor/data-sources", ...ENGINES],
    "ai-gateway: provider abstraction only — usage is recorded through injected interfaces.",
  ),
  boundary(
    ["packages/discovery-engine/**"],
    ["@supabase/*", "@sor/pain-point-engine", "@sor/opportunity-engine"],
    "engines communicate only through persisted artifacts; database access goes through @sor/database.",
  ),
  boundary(
    ["packages/pain-point-engine/**"],
    ["@supabase/*", "@sor/discovery-engine", "@sor/opportunity-engine"],
    "engines communicate only through persisted artifacts; database access goes through @sor/database.",
  ),
  boundary(
    ["packages/opportunity-engine/**"],
    ["@supabase/*", "@sor/discovery-engine", "@sor/pain-point-engine"],
    "engines communicate only through persisted artifacts; database access goes through @sor/database.",
  ),
  boundary(
    ["apps/web/**"],
    ["@sor/data-sources", "@sor/ai-gateway", ...ENGINES],
    "web: no AI or source fetching in the web app — create a job instead (CLAUDE.md §11).",
  ),

  // --- Next.js -------------------------------------------------------------
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
    settings: { next: { rootDir: "apps/web/" } },
  },
);
