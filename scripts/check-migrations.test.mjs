// node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMigrations } from "./check-migrations.mjs";

const base = ["20261110090000_job_quotas.sql", "20261111090000_ops_monitoring.sql"];

test("accepts a new migration after the last one", () => {
  const head = [...base, "20261112090000_next.sql"];
  assert.deepEqual(
    checkMigrations({ head, base, changed: [{ status: "A", file: "20261112090000_next.sql" }] }),
    [],
  );
});

test("refuses a new migration that sorts before an existing one", () => {
  const head = [...base, "20261108100000_late.sql"];
  const errors = checkMigrations({
    head,
    base,
    changed: [{ status: "A", file: "20261108100000_late.sql" }],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must sort after 20261111090000_ops_monitoring\.sql/);
});

test("refuses editing or deleting an applied migration", () => {
  const errors = checkMigrations({
    head: [base[1]],
    base,
    changed: [
      { status: "D", file: base[0] },
      { status: "M", file: base[1] },
    ],
  });
  assert.equal(errors.length, 2);
});

test("refuses malformed names and duplicate timestamps", () => {
  const errors = checkMigrations({
    head: ["2026_bad.sql", "20261112090000_a.sql", "20261112090000_b.sql"],
    base: null,
    changed: [],
  });
  assert.equal(errors.length, 2);
});
