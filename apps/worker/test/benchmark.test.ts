// PD-24a benchmark runner: inputs load, stages plan as documented, paid runs
// are refused without confirmation/cap/keys, the spending cap stops a run
// before any call that could exceed it, and the fake dry run costs nothing.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { acceptedExclusions } from "@sor/discovery-engine";
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
    expect(s1.calibration).toEqual(
      expect.objectContaining({ cases: ["official-pricing", "rewardful"], margin: 1.25 }),
    );
    expect(s1.runs.filter((r) => r.cases.length === 14).map((r) => r.configId)).toEqual([
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

describe("calibration gate (PD-24a B)", () => {
  const empty = {
    claims: [],
    features: [],
    integrations: [],
    pricing_plans: [],
    primary_use_case: null,
    core_purpose_flag: "unknown",
    unknown_fields: [],
    warnings: [],
  };
  const anthropic = (outputTokens: number, status = 200) => {
    let posts = 0;
    const fetch = async (_url: string, init: RequestInit) => {
      if (init.method === "GET")
        return new Response(JSON.stringify({ data: [{ id: "claude-haiku-5-5" }] }), {
          status: 200,
        });
      posts++;
      if (status !== 200) return new Response("invalid request", { status });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(empty) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1000, output_tokens: outputTokens },
        }),
        { status: 200 },
      );
    };
    return { fetch, posts: () => posts };
  };
  const cases = ["official-pricing", "rewardful", "sparse", "savvycal"].map((id) =>
    files.cases.find((c) => c.id === id)!,
  );
  const planned = [{ configId: "A1", cases, runs: 1 }];
  const calibration = { cases: ["official-pricing", "rewardful"], margin: 1.25 };
  const env = { ANTHROPIC_API_KEY: "k-test" };

  it("runs the calibration cases first and proceeds when the forecast fits", async () => {
    const api = anthropic(500);
    const report = await runStage(
      files,
      "t",
      planned,
      1,
      { env, confirmPaid: true, fetch: api.fetch },
      undefined,
      calibration,
    );
    expect(report.calibration?.proceeded).toBe(true);
    expect(report.stoppedReason).toBeNull();
    expect(report.results[0]?.runs[0]?.map((s) => s.caseId)).toEqual([
      "official-pricing",
      "rewardful",
      "sparse",
      "savvycal",
    ]);
    expect(api.posts()).toBe(4); // D6 is skipped when D5 proposes nothing
  });

  it("stops before the main pass when the measured forecast does not fit", async () => {
    const api = anthropic(200_000); // 0.10 USD per call at Haiku prices
    const report = await runStage(
      files,
      "t",
      planned,
      0.4,
      { env, confirmPaid: true, fetch: api.fetch },
      undefined,
      calibration,
    );
    expect(api.posts()).toBe(2);
    expect(report.calibration).toMatchObject({ proceeded: false });
    expect(report.calibration?.forecastUsd).toBeCloseTo(0.2, 2);
    expect(report.stoppedReason).toMatch(/calibration forecast/);
    expect(report.spentUsd).toBeLessThanOrEqual(0.4);
  });

  it("stops when a calibration call fails (adapter smoke test), at no cost", async () => {
    const api = anthropic(500, 400);
    const report = await runStage(
      files,
      "t",
      planned,
      1,
      { env, confirmPaid: true, fetch: api.fetch },
      undefined,
      calibration,
    );
    expect(report.stoppedReason).toMatch(/calibration failed for A1\/official-pricing/);
    expect(report.spentUsd).toBe(0);
    expect(api.posts()).toBe(1);
  });
});

describe("GrowSurf exclusion decision (PD-24a D)", () => {
  it("expects excluded, accepts needs_review, never eligible", () => {
    const growsurf = files.cases.find((c) => c.id === "growsurf")!;
    expect(growsurf.expected_exclusion).toBe("excluded");
    expect(acceptedExclusions(growsurf)).toEqual(["excluded", "needs_review"]);
    expect(
      acceptedExclusions({ ...growsurf, accepted_exclusions: ["excluded", "eligible"] }),
    ).toEqual(["excluded"]);
  });
});
