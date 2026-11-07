// Migration guard (Sprint 7, S7.4a; Technical Blueprint §14: migrations are
// timestamped, forward-only and never edited once applied).
//
// Rules (decided by the product owner on 7 Nov 2026):
// 1. file names are `<14-digit timestamp>_<snake_case>.sql`, timestamps unique;
// 2. a migration added since the base revision sorts after every migration of
//    the base (existing names are kept, order is enforced from now on);
// 3. a migration of the base is never modified, renamed or deleted.
//
// Usage: node scripts/check-migrations.mjs [<base-revision>]
// Without a base (or an unknown one), only rule 1 is checked.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MIGRATIONS_DIR = "supabase/migrations";
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

/**
 * @param {{ head: string[]; base: string[] | null; changed: Array<{ status: string; file: string }> }} input
 *   head: migration file names now; base: names at the base revision (null = unknown);
 *   changed: `git diff --name-status` entries limited to the migrations directory (base names).
 * @returns {string[]} errors
 */
export function checkMigrations({ head, base, changed }) {
  const errors = [];
  const stamps = new Map();
  for (const f of head) {
    const m = NAME.exec(f);
    if (!m) {
      errors.push(`${f}: name must be <YYYYMMDDHHMMSS>_<snake_case>.sql`);
      continue;
    }
    if (stamps.has(m[1]))
      errors.push(`${f}: timestamp ${m[1]} already used by ${stamps.get(m[1])}`);
    stamps.set(m[1], f);
  }
  if (base === null) return errors;

  const baseSet = new Set(base);
  const lastBase = [...base].sort().at(-1) ?? "";
  for (const { status, file } of changed) {
    if (baseSet.has(file) && status !== "A")
      errors.push(
        `${file}: applied migrations are forward-only (status ${status}); add a new migration instead`,
      );
  }
  for (const f of head) {
    if (!baseSet.has(f) && f <= lastBase)
      errors.push(`${f}: new migration must sort after ${lastBase} (use a later timestamp)`);
  }
  return errors;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const head = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const ref = process.argv[2];
  let base = null;
  let changed = [];
  if (ref && !/^0+$/.test(ref)) {
    try {
      git(["rev-parse", "--verify", `${ref}^{commit}`]);
      base = git(["ls-tree", "--name-only", `${ref}:${MIGRATIONS_DIR}`])
        .split("\n")
        .filter((f) => f.endsWith(".sql"));
      changed = git(["diff", "--name-status", "--no-renames", ref, "--", MIGRATIONS_DIR])
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [status, path] = line.split("\t");
          return { status: status ?? "", file: (path ?? "").split("/").at(-1) ?? "" };
        });
    } catch {
      console.log(`base ${ref} not available: checking names only`);
      base = null;
    }
  } else {
    console.log("no base revision: checking names only");
  }
  const errors = checkMigrations({ head, base, changed });
  for (const e of errors) console.error(`::error::${e}`);
  console.log(
    `${head.length} migrations checked${base ? ` against ${ref}` : ""}: ${errors.length} error(s)`,
  );
  if (errors.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
