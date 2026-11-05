// PD-24a benchmark runner (evals/benchmark/PLAN.md): loads the evaluation
// cases and configurations, runs each configuration through the production
// enrichment pipeline under a hard spending cap, and writes a JSON + Markdown
// report. Real providers are used only with an explicit confirmation flag and
// keys present in the environment; the fake provider costs nothing.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  AIGateway,
  AnthropicProvider,
  FakeProvider,
  MistralProvider,
  OpenAIProvider,
  costUsd,
  worstCaseCostUsd,
  type AIProvider,
  type EmbeddingResult,
  type ModelPricing,
  type ModelSettings,
  type ProviderCall,
  type ProviderResponse,
} from "@sor/ai-gateway";
import {
  fakeEnrichmentHandlers,
  fromAdversarialCase,
  fromRealSite,
  fromSyntheticFixture,
  runCase,
  scoreCase,
  summarize,
  type CaseRun,
  type CaseScore,
  type ConfigSummary,
  type EvalCase,
} from "@sor/discovery-engine";

type Raw = Record<string, unknown>;
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown;

export const PROVIDER_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

export interface BenchConfig {
  provider: "fake" | "anthropic" | "openai" | "mistral";
  label: string;
  d5: ModelSettings;
  d6: ModelSettings;
}

export interface BenchFiles {
  cases: EvalCase[];
  annotationStatus: { draft: number; reviewed: number };
  configs: Record<string, BenchConfig>;
  caseSets: Record<string, unknown>;
  stages: Record<
    string,
    {
      cap_usd: number | null;
      groups: Array<{ configs: string[] | string; cases: string; runs: number }>;
      calibration?: Calibration;
    }
  >;
  pricing: Record<string, ModelPricing>;
}

/** Reads every benchmark input from the repository root. */
export function loadBenchFiles(root: string): BenchFiles {
  const e = (p: string) => path.join(root, "evals", p);
  const cases: EvalCase[] = [];
  for (const f of readJson(e("enrichment/fixtures.json")) as Raw[])
    cases.push(fromSyntheticFixture(f));
  for (const f of readJson(e("enrichment/adversarial.json")) as Raw[])
    cases.push(fromAdversarialCase(f));
  const annotationStatus = { draft: 0, reviewed: 0 };
  for (const site of (readJson(e("enrichment/real/sites.json")) as { sites: Raw[] }).sites) {
    const snapFile = e(`enrichment/real/snapshots/${String(site.id)}.json`);
    const annFile = e(`enrichment/real/annotations/${String(site.id)}.json`);
    if (!existsSync(snapFile) || !existsSync(annFile)) continue;
    const snapshot = readJson(snapFile) as Raw;
    if ((snapshot.pages as unknown[]).length === 0) continue;
    const annotation = readJson(annFile) as Raw;
    if (annotation.status === "reviewed") annotationStatus.reviewed++;
    else annotationStatus.draft++;
    cases.push(fromRealSite(site, snapshot, annotation));
  }
  const conf = readJson(e("benchmark/configs.json")) as Raw;
  const prices = (readJson(e("benchmark/pricing.json")) as { models: Record<string, Raw> }).models;
  const pricing: Record<string, ModelPricing> = {};
  for (const [model, p] of Object.entries(prices)) {
    const long = p.long_context as
      { threshold_tokens: number; input: number; output: number } | undefined;
    pricing[model] = {
      inputPerMTok: Number(p.input),
      outputPerMTok: Number(p.output),
      ...(typeof p.cache_read === "number" ? { cacheReadPerMTok: p.cache_read } : {}),
      ...(long
        ? {
            longContext: {
              thresholdTokens: long.threshold_tokens,
              inputPerMTok: long.input,
              outputPerMTok: long.output,
            },
          }
        : {}),
    };
  }
  return {
    cases,
    annotationStatus,
    configs: conf.configs as Record<string, BenchConfig>,
    caseSets: conf.case_sets as Record<string, unknown>,
    stages: conf.stages as BenchFiles["stages"],
    pricing,
  };
}

export function selectCases(files: BenchFiles, set: string): EvalCase[] {
  const def = files.caseSets[set];
  if (def === "*") return files.cases;
  if (Array.isArray(def)) {
    const ids = new Set(def as string[]);
    const picked = files.cases.filter((c) => ids.has(c.id));
    if (picked.length !== ids.size) throw new Error(`case set ${set}: unknown case id`);
    return picked;
  }
  if (def && typeof def === "object" && "real_except" in def) {
    const except = new Set(
      files.caseSets[(def as { real_except: string }).real_except] as string[],
    );
    return files.cases.filter((c) => c.kind === "real" && !except.has(c.id));
  }
  throw new Error(`unknown case set ${set}`);
}

/** Keeps the provider's last error message (the gateway only records outcomes). */
class RecordingProvider implements AIProvider {
  readonly errors: string[] = [];
  constructor(private readonly inner: AIProvider) {}
  get id() {
    return this.inner.id;
  }
  estimateMaxCostUsd(call: Omit<ProviderCall, "signal">): number {
    return this.inner.estimateMaxCostUsd(call);
  }
  async generate(call: ProviderCall): Promise<ProviderResponse> {
    try {
      return await this.inner.generate(call);
    } catch (err) {
      this.errors.push(
        `${call.request.agentKey}: ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          300,
        ),
      );
      throw err;
    }
  }
  embed(texts: string[], model: string, signal: AbortSignal): Promise<EmbeddingResult> {
    return this.inner.embed(texts, model, signal);
  }
}

export interface RunOptions {
  env: Record<string, string | undefined>;
  confirmPaid: boolean;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

function buildProvider(config: BenchConfig, files: BenchFiles, options: RunOptions): AIProvider {
  if (config.provider === "fake") return new FakeProvider(fakeEnrichmentHandlers);
  const key = options.env[PROVIDER_KEYS[config.provider] ?? ""];
  if (!key) throw new Error(`missing ${PROVIDER_KEYS[config.provider]} in the environment`);
  const pricing: Record<string, ModelPricing> = {};
  for (const m of [config.d5.model, config.d6.model]) {
    const p = files.pricing[m];
    if (!p) throw new Error(`no verified price for model ${m} (evals/benchmark/pricing.json)`);
    pricing[m] = p;
  }
  const opts = { apiKey: key, pricing, ...(options.fetch ? { fetch: options.fetch } : {}) };
  if (config.provider === "anthropic") return new AnthropicProvider(opts);
  if (config.provider === "openai") return new OpenAIProvider(opts);
  return new MistralProvider(opts);
}

export interface PlannedRun {
  configId: string;
  cases: EvalCase[];
  runs: number;
}

export function planStage(
  files: BenchFiles,
  stage: string,
  finalists: string[] = [],
  only: string[] = [],
): { cap: number | null; runs: PlannedRun[]; calibration: Calibration | null } {
  const def = files.stages[stage];
  if (!def) throw new Error(`unknown stage ${stage}`);
  const runs: PlannedRun[] = [];
  for (const g of def.groups) {
    const ids = g.configs === "finalists" ? finalists : (g.configs as string[]);
    if (g.configs === "finalists" && ids.length === 0)
      throw new Error(`stage ${stage} needs --configs (the approved finalists)`);
    for (const id of ids) {
      if (only.length > 0 && !only.includes(id)) continue;
      if (!files.configs[id]) throw new Error(`unknown configuration ${id}`);
      runs.push({ configId: id, cases: selectCases(files, g.cases), runs: g.runs });
    }
  }
  return { cap: def.cap_usd, runs, calibration: def.calibration ?? null };
}

/** Refuses paid runs without confirmation, a positive cap and every key. */
export function checkPaidGuard(
  files: BenchFiles,
  runs: PlannedRun[],
  cap: number,
  options: RunOptions,
): void {
  const providers = new Set(runs.map((r) => files.configs[r.configId]?.provider));
  providers.delete("fake");
  if (providers.size === 0) return;
  if (!options.confirmPaid)
    throw new Error(
      "paid providers selected: re-run with --confirm-paid once the product owner has approved this stage",
    );
  if (!(cap > 0)) throw new Error("paid providers need a positive --cap in USD");
  const missing = [...providers]
    .map((p) => PROVIDER_KEYS[p ?? ""])
    .filter((k) => !k || !options.env[k]);
  if (missing.length > 0)
    throw new Error(`missing API key(s) in the environment: ${missing.join(", ")}`);
}

const MODEL_LISTS: Record<
  string,
  { url: string; headers: (key: string) => Record<string, string> }
> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1000",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
};

/**
 * Free model listings: every configured model id must exist for its vendor
 * before a paid stage starts (no generation call is made here).
 */
export async function preflightModels(
  files: BenchFiles,
  runs: PlannedRun[],
  options: RunOptions,
): Promise<void> {
  const wanted = new Map<string, Set<string>>();
  for (const r of runs) {
    const c = files.configs[r.configId] as BenchConfig;
    if (c.provider === "fake") continue;
    const set = wanted.get(c.provider) ?? new Set<string>();
    set.add(c.d5.model).add(c.d6.model);
    wanted.set(c.provider, set);
  }
  const doFetch = options.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
  const missing: string[] = [];
  for (const [provider, models] of wanted) {
    const list = MODEL_LISTS[provider];
    const key = options.env[PROVIDER_KEYS[provider] ?? ""] ?? "";
    if (!list) continue;
    const res = await doFetch(list.url, { method: "GET", headers: list.headers(key) });
    if (!res.ok)
      throw new Error(
        `${provider}: model listing failed (http ${res.status}); check the key and network access`,
      );
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = new Set((body.data ?? []).map((m) => m.id));
    for (const m of models) if (!ids.has(m)) missing.push(`${provider}:${m}`);
  }
  if (missing.length > 0)
    throw new Error(`model id(s) not offered by the vendor: ${missing.join(", ")}`);
}

export interface ConfigResult {
  configId: string;
  label: string;
  provider: string;
  models: { d5: string; d6: string };
  runs: CaseScore[][];
  summary: ConfigSummary;
  reproducibility: { cases: number; exclusionStable: number } | null;
  providerErrors: string[];
}

/** Calibration gate of a paid stage (PD-24a B, approved 5 Nov 2026). */
export interface Calibration {
  /** Cases each configuration runs first. */
  cases: string[];
  /** Safety factor on the measured forecast. */
  margin: number;
}

export interface CalibrationReport {
  spentUsd: number;
  /** Forecast of the remaining work from measured tokens, before the margin. */
  forecastUsd: number;
  margin: number;
  /** Largest worst-case reservation of a single remaining call. */
  reservationUsd: number;
  /** Remaining cap when the gate was evaluated. */
  remainingUsd: number;
  proceeded: boolean;
  perConfig: Record<string, { measuredCases: number; forecastUsd: number; remainingCases: number }>;
}

/** Characters per enrichment besides the pages (instructions, schemas, items, wrappers). */
const OVERHEAD_CHARS = 20_000;
const pageChars = (c: EvalCase) => Object.values(c.pages).reduce((n, t) => n + t.length, 0);

/**
 * Forecast of a configuration's remaining cases from its calibration scores.
 * Input tokens: a line through the measured points against the page size
 * (never decreasing). Output tokens (reasoning included): the measurement of
 * the same kind of case — real site vs synthetic/adversarial — or the highest.
 */
export function forecastConfig(
  measured: CaseScore[],
  measuredCases: EvalCase[],
  remaining: EvalCase[],
  pricing: ModelPricing,
): number {
  if (remaining.length === 0) return 0;
  const points = measured
    .map((s, i) => ({ s, c: measuredCases[i] }))
    .filter((p): p is { s: CaseScore; c: EvalCase } => p.c !== undefined && p.s.error === null);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  const byChars = [...points].sort((a, b) => pageChars(a.c) - pageChars(b.c));
  const lo = byChars[0] as (typeof points)[number];
  const hi = byChars[byChars.length - 1] as (typeof points)[number];
  const span = pageChars(hi.c) - pageChars(lo.c);
  // One point (or equal sizes): tokens proportional to the page size, overhead included — conservative.
  const slope =
    span > 0
      ? Math.max(0, (hi.s.inputTokens - lo.s.inputTokens) / span)
      : hi.s.inputTokens / Math.max(1, pageChars(hi.c));
  const intercept = span > 0 ? Math.max(0, lo.s.inputTokens - slope * pageChars(lo.c)) : 0;
  const maxOut = Math.max(...points.map((p) => p.s.outputTokens));
  const outFor = (c: EvalCase) => {
    const same = points.filter((p) => (p.c.kind === "real") === (c.kind === "real"));
    return same.length > 0 ? Math.max(...same.map((p) => p.s.outputTokens)) : maxOut;
  };
  return remaining.reduce(
    (sum, c) =>
      sum +
      costUsd(pricing, {
        inputTokens: Math.ceil(intercept + slope * pageChars(c)),
        outputTokens: outFor(c),
      }),
    0,
  );
}

export interface StageReport {
  stage: string;
  calibration: CalibrationReport | null;
  startedAt: string;
  finishedAt: string;
  capUsd: number;
  spentUsd: number;
  stoppedReason: string | null;
  annotationStatus: BenchFiles["annotationStatus"];
  results: ConfigResult[];
}

export async function runStage(
  files: BenchFiles,
  stage: string,
  planned: PlannedRun[],
  cap: number,
  options: RunOptions,
  log: (line: string) => void = () => undefined,
  calibration: Calibration | null = null,
): Promise<StageReport> {
  checkPaidGuard(files, planned, cap, options);
  await preflightModels(files, planned, options);
  const startedAt = new Date().toISOString();
  let spent = 0;
  let stoppedReason: string | null = null;
  let calibrationReport: CalibrationReport | null = null;

  const contexts = planned.map((plan) => {
    const config = files.configs[plan.configId] as BenchConfig;
    const provider = new RecordingProvider(buildProvider(config, files, options));
    const gateway = new AIGateway({
      provider,
      models: { fast_extraction: config.d5, verification: config.d6 },
    });
    const runs: CaseScore[][] = Array.from({ length: plan.runs }, () => []);
    return { plan, config, provider, gateway, runs };
  });

  /** Runs one case; returns false when the stage must stop. */
  const runOne = async (ctx: (typeof contexts)[number], c: EvalCase, r: number) => {
    const run: CaseRun = await runCase(c, ctx.gateway, {
      remainingUsd: () => cap - spent,
      onSpend: (usd) => {
        spent += usd;
      },
    });
    const score = scoreCase(c, run);
    ctx.runs[r]?.push(score);
    log(
      `${ctx.plan.configId} run ${r + 1} ${c.id}: found ${score.expectedFound}/${score.expectedTotal}, ` +
        `unsupported ${score.unsupported.length}, forbidden ${score.forbidden.length}, ` +
        `exclusion ${score.exclusion ?? "-"}, ${score.costUsd.toFixed(4)} USD, total ${spent.toFixed(4)} USD` +
        (score.error ? `, ERROR ${score.error}` : ""),
    );
    if (run.outcome?.terminalReason === "budget_exhausted") {
      stoppedReason = `spending cap of ${cap} USD reached during ${ctx.plan.configId}/${c.id}`;
      return false;
    }
    return true;
  };

  // Phase 1 — calibration: each configuration runs the calibration cases first.
  const calibrated = new Map<string, Set<string>>();
  if (calibration) {
    for (const ctx of contexts) {
      const cases = ctx.plan.cases.filter((c) => calibration.cases.includes(c.id));
      calibrated.set(ctx.plan.configId, new Set(cases.map((c) => c.id)));
      for (const c of cases) {
        if (!(await runOne(ctx, c, 0))) break;
        if (ctx.runs[0]?.at(-1)?.error) break; // first failure ends the smoke test
      }
      if (stoppedReason) break;
      const failed = ctx.runs[0]?.find((s) => s.error);
      if (failed) {
        stoppedReason = `calibration failed for ${ctx.plan.configId}/${failed.caseId}: ${failed.error}`;
        break;
      }
    }
    if (!stoppedReason) {
      const perConfig: CalibrationReport["perConfig"] = {};
      let forecast = 0;
      let reservation = 0;
      for (const ctx of contexts) {
        const done = calibrated.get(ctx.plan.configId) ?? new Set<string>();
        const measured = ctx.runs[0] ?? [];
        const measuredCases = measured.map(
          (m) => ctx.plan.cases.find((c) => c.id === m.caseId) as EvalCase,
        );
        const remaining = [
          ...ctx.plan.cases.filter((c) => !done.has(c.id)),
          ...Array.from({ length: ctx.plan.runs - 1 }, () => ctx.plan.cases).flat(),
        ];
        const pricing = files.pricing[ctx.config.d5.model] ?? { inputPerMTok: 0, outputPerMTok: 0 };
        const f =
          ctx.config.provider === "fake"
            ? 0
            : forecastConfig(measured, measuredCases, remaining, pricing);
        perConfig[ctx.plan.configId] = {
          measuredCases: measured.length,
          forecastUsd: f,
          remainingCases: remaining.length,
        };
        forecast += f;
        if (ctx.config.provider !== "fake")
          for (const c of remaining)
            reservation = Math.max(
              reservation,
              worstCaseCostUsd(
                pricing,
                pageChars(c) + OVERHEAD_CHARS,
                ctx.config.d5.maxOutputTokens ?? 4000,
              ),
            );
      }
      const remainingUsd = cap - spent;
      const proceeded = forecast * calibration.margin + reservation <= remainingUsd + 1e-9;
      calibrationReport = {
        spentUsd: spent,
        forecastUsd: forecast,
        margin: calibration.margin,
        reservationUsd: reservation,
        remainingUsd,
        proceeded,
        perConfig,
      };
      log(
        `calibration: spent ${spent.toFixed(4)} USD, forecast ${forecast.toFixed(4)} USD x ${calibration.margin} ` +
          `+ reservation ${reservation.toFixed(4)} vs remaining ${remainingUsd.toFixed(4)} -> ${proceeded ? "proceed" : "stop"}`,
      );
      if (!proceeded)
        stoppedReason =
          `calibration forecast ${(forecast * calibration.margin + reservation).toFixed(2)} USD ` +
          `exceeds the remaining ${remainingUsd.toFixed(2)} USD: stopped before the main pass for the product owner's decision`;
    }
  }

  // Phase 2 — main pass.
  for (const ctx of contexts) {
    if (stoppedReason) break;
    const done = calibrated.get(ctx.plan.configId) ?? new Set<string>();
    for (let r = 0; r < ctx.plan.runs && !stoppedReason; r++) {
      for (const c of ctx.plan.cases) {
        if (r === 0 && done.has(c.id)) continue;
        if (!(await runOne(ctx, c, r))) break;
      }
    }
  }

  const results: ConfigResult[] = contexts
    .filter((ctx) => ctx.runs.some((rs) => rs.length > 0))
    .map((ctx) => {
      const runs = ctx.runs.filter((rs) => rs.length > 0);
      let reproducibility: ConfigResult["reproducibility"] = null;
      if (runs.length > 1) {
        const ids = runs[0]?.map((s) => s.caseId) ?? [];
        const stable = ids.filter(
          (id) => new Set(runs.map((rs) => rs.find((s) => s.caseId === id)?.exclusion)).size === 1,
        );
        reproducibility = { cases: ids.length, exclusionStable: stable.length };
      }
      return {
        configId: ctx.plan.configId,
        label: ctx.config.label,
        provider: ctx.config.provider,
        models: { d5: ctx.config.d5.model, d6: ctx.config.d6.model },
        runs,
        summary: summarize(runs.flat()),
        reproducibility,
        providerErrors: ctx.provider.errors.slice(0, 50),
      };
    });
  return {
    stage,
    calibration: calibrationReport,
    startedAt,
    finishedAt: new Date().toISOString(),
    capUsd: cap,
    spentUsd: spent,
    stoppedReason,
    annotationStatus: files.annotationStatus,
    results,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const usd = (x: number) => `${x.toFixed(4)}`;

export function renderReport(report: StageReport): string {
  const lines = [
    `# PD-24a benchmark — ${report.stage}`,
    "",
    `- Started ${report.startedAt}, finished ${report.finishedAt}`,
    `- Spending cap ${report.capUsd} USD, spent ${report.spentUsd.toFixed(4)} USD`,
    `- Stopped early: ${report.stoppedReason ?? "no"}`,
    ...(report.calibration
      ? [
          `- Calibration: spent ${report.calibration.spentUsd.toFixed(4)} USD; forecast of the remaining work ${report.calibration.forecastUsd.toFixed(4)} USD x ${report.calibration.margin} + largest call reservation ${report.calibration.reservationUsd.toFixed(4)} USD vs remaining ${report.calibration.remainingUsd.toFixed(4)} USD: ${report.calibration.proceeded ? "proceeded" : "stopped"}`,
        ]
      : []),
    `- Real-site annotations: ${report.annotationStatus.reviewed} reviewed, ${report.annotationStatus.draft} draft`,
    "",
    "| Config | Cases | Gates | Unsupported | Forbidden | Exclusion | 1st-attempt valid | Lost | Recall | Cost USD | Mean / p95 per real site | p95 latency s |",
    "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---:|",
  ];
  for (const r of report.results) {
    const s = r.summary;
    const failed = Object.entries(s.gates)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    lines.push(
      `| ${r.configId} | ${s.cases} | ${s.passesGates ? "pass" : `fail (${failed.join(", ")})`} | ${pct(s.unsupportedRate)} | ${s.forbiddenAccepted} | ${pct(s.exclusionAccuracy)} | ${pct(s.firstAttemptValidRate)} | ${s.lostEnrichments} | ${pct(s.recall)} | ${usd(s.costUsd)} | ${usd(s.meanCostPerRealUsd)} / ${usd(s.p95CostPerRealUsd)} | ${(s.p95LatencyMs / 1000).toFixed(1)} |`,
    );
  }
  lines.push("", "## Details", "");
  for (const r of report.results) {
    lines.push(
      `### ${r.configId} — ${r.label}`,
      "",
      `Models: D5 \`${r.models.d5}\`, D6 \`${r.models.d6}\`.`,
      "",
    );
    if (r.reproducibility)
      lines.push(
        `Exclusion stable across runs on ${r.reproducibility.exclusionStable}/${r.reproducibility.cases} cases.`,
        "",
      );
    const issues = r.runs
      .flat()
      .filter(
        (s) => s.unsupported.length + s.forbidden.length > 0 || !s.exclusionCorrect || s.error,
      );
    for (const s of issues) {
      const parts = [
        ...s.unsupported.map((u) => `unsupported: ${u}`),
        ...s.forbidden.map((f) => `forbidden: ${f}`),
        ...(s.exclusionCorrect
          ? []
          : [`exclusion ${s.exclusion ?? "none"} (expected ${s.exclusionExpected})`]),
        ...(s.error ? [`error: ${s.error}`] : []),
      ];
      lines.push(`- \`${s.caseId}\`: ${parts.join("; ")}`);
    }
    if (issues.length === 0) lines.push("- no gate issue");
    if (r.providerErrors.length > 0) {
      lines.push("", "Provider errors:", ...r.providerErrors.map((e) => `- ${e}`));
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
