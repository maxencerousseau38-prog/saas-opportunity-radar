// PD-24a benchmark runner: inputs load, stages plan as documented, paid runs
// are refused without confirmation/cap/keys, the spending cap stops a run
// before any call that could exceed it, and the fake dry run costs nothing.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkPaidGuard,
  loadBenchFiles,
  planStage,
  renderReport,
  runStage,
} from "../src/evals/benchmark-runner";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const files = loadBenchFiles(root);

describe("benchmark inputs", () => {
  it("loads the 39 evaluation cases and prices every configured model", () => {
    const kinds = files.cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(kinds).toEqual({ synthetic: 6, adversarial: 5, real: 28 });
    for (const [id, c] of Object.entries(files.configs)) {
      if (c.provider === "fake") continue;
      expect(files.pricing[c.d5.model], `${id} d5`).toBeDefined();
      expect(files.pricing[c.d6.model], `${id} d6`).toBeDefined();
    }
  });

  it("plans the stages of evals/benchmark/PLAN.md", () => {
    const s1 = planStage(files, "stage1");
    expect(s1.cap).toBe(22);
    expect(s1.runs).toHaveLength(15);
    expect(s1.runs.filter((r) => r.cases.length === 21)).toHaveLength(12);
    expect(s1.runs.filter((r) => r.cases.length === 15).map((r) => r.configId)).toEqual([
      "A5",
      "O5",
      "M5",
    ]);
    expect(() => planStage(files, "stage2")).toThrow(/--configs/);
    const s2 = planStage(files, "stage2", ["A1", "O2"]);
    expect(s2.runs.map((r) => [r.configId, r.cases.length, r.runs])).toEqual([
      ["A1", 18, 1],
      ["O2", 18, 1],
      ["A1", 21, 2],
      ["O2", 21, 2],
    ]);
  });
});

describe("paid-run guard", () => {
  const runs = planStage(files, "stage1", [], ["A1"]).runs;
  it("refuses without confirmation, without a cap or without the key", () => {
    expect(() => checkPaidGuard(files, runs, 5, { env: {}, confirmPaid: false })).toThrow(
      /--confirm-paid/,
    );
    expect(() =>
      checkPaidGuard(files, runs, 0, { env: { ANTHROPIC_API_KEY: "k" }, confirmPaid: true }),
    ).toThrow(/cap/);
    expect(() => checkPaidGuard(files, runs, 5, { env: {}, confirmPaid: true })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
    expect(() =>
      checkPaidGuard(files, runs, 5, { env: { ANTHROPIC_API_KEY: "k" }, confirmPaid: true }),
    ).not.toThrow();
  });

  it("stops at the cap before sending a call that could exceed it", async () => {
    let requests = 0;
    const fetch = async (_url: string, init: RequestInit) => {
      if (init.method === "GET")
        return new Response(JSON.stringify({ data: [{ id: "claude-haiku-5-5" }] }), {
          status: 200,
        });
      requests++;
      return new Response("{}", { status: 500 });
    };
    const planned = [
      { configId: "A1", cases: files.cases.filter((c) => c.kind === "real").slice(0, 2), runs: 1 },
    ];
    const report = await runStage(files, "test", planned, 0.0001, {
      env: { ANTHROPIC_API_KEY: "k-test" },
      confirmPaid: true,
      fetch,
    });
    expect(requests).toBe(0);
    expect(report.spentUsd).toBe(0);
    expect(report.stoppedReason).toMatch(/spending cap/);
  });
});

describe("model preflight", () => {
  it("refuses a paid stage whose model ids the vendor does not list", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ data: [{ id: "other" }] }), { status: 200 });
    const planned = planStage(files, "stage1", [], ["A1"]).runs;
    await expect(
      runStage(files, "test", planned, 5, {
        env: { ANTHROPIC_API_KEY: "k" },
        confirmPaid: true,
        fetch,
      }),
    ).rejects.toThrow(/anthropic:claude-haiku-5-5/);
  });
});

describe("dry run (fake provider)", () => {
  it("runs the pipeline on the screening set at zero cost and renders a report", async () => {
    const planned = planStage(files, "dry-run").runs.map((r) => ({
      ...r,
      cases: r.cases.filter((c) => c.kind !== "real" || c.id === "savvycal"),
    }));
    const report = await runStage(files, "dry-run", planned, 0, { env: {}, confirmPaid: false });
    expect(report.spentUsd).toBe(0);
    expect(report.stoppedReason).toBeNull();
    const fake = report.results[0];
    expect(fake?.summary.cases).toBe(12);
    // The adversarial discontinued case lists archived plans the fake reports: the scorer flags them.
    expect(fake?.runs[0]?.find((s) => s.caseId === "adv-discontinued")?.forbidden).toContain(
      "plan Starter",
    );
    expect(renderReport(report)).toContain("| FAKE | 12 |");
  });
});
