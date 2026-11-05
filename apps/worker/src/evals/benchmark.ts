// PD-24a benchmark command line (evals/benchmark/PLAN.md).
//   node apps/worker/dist-evals/benchmark.js --stage dry-run
//   node apps/worker/dist-evals/benchmark.js --stage stage1 --confirm-paid   (after approval)
//   node apps/worker/dist-evals/benchmark.js --stage stage2 --configs A1,O2 --cap 8 --confirm-paid
// Options: --root <repo> (default cwd), --out <dir>, --only <ids>, --cap <usd>.
// Paid stages refuse to start without --confirm-paid, a positive cap and the
// API keys in the environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, MISTRAL_API_KEY).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBenchFiles, planStage, renderReport, runStage } from "./benchmark-runner";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const list = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
const log = (line: string) => process.stdout.write(`${line}\n`);

const stage = arg("stage");
if (!stage) {
  process.stderr.write("usage: benchmark.js --stage <dry-run|stage1|stage2> [options]\n");
  process.exit(2);
}
const root = arg("root") ?? process.cwd();
const files = loadBenchFiles(root);
const planned = planStage(files, stage, list(arg("configs")), list(arg("only")));
const capArg = arg("cap");
const cap = capArg !== undefined ? Number(capArg) : (planned.cap ?? Number.NaN);
if (!Number.isFinite(cap) || cap < 0) {
  process.stderr.write("a spending cap is required (--cap <usd>)\n");
  process.exit(2);
}
const total = planned.runs.reduce((n, r) => n + r.cases.length * r.runs, 0);
log(
  `stage ${stage}: ${planned.runs.length} configuration(s), ${total} enrichment(s), cap ${cap} USD`,
);

try {
  const report = await runStage(
    files,
    stage,
    planned.runs,
    cap,
    { env: process.env, confirmPaid: process.argv.includes("--confirm-paid") },
    log,
  );
  const out = arg("out") ?? path.join(root, "evals/benchmark/results", stage);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(out, "report.md"), renderReport(report));
  log(`spent ${report.spentUsd.toFixed(4)} USD; report written to ${out}`);
} catch (err) {
  process.stderr.write(
    `benchmark refused or failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}
