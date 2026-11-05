// Opportunity analyses on the local Supabase stack (CI job "worker-integration"):
// CSV feedback import → analysis request → worker (fake provider) → nested
// pain point run (P1–P7) for the customer voice → evidence index, dimension
// scores, findings, verdict and report written by sor_analysis_finalize →
// Markdown export; a second analysis reuses the covering pain point run;
// incomplete evidence gives VALIDATE FIRST without a final score.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { analysisRepo, createServiceClient, jobsRepo, type DbClient } from "@sor/database";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakeOpportunityHandlers } from "@sor/opportunity-engine";
import { fakePainPointHandlers } from "@sor/pain-point-engine";
import { Worker } from "../../src/runtime";
import { feedbackImportHandler } from "../../src/handlers/imports";
import { opportunityAnalysisHandler, reportExportHandler } from "../../src/handlers/analysis";
import { limitsLoader } from "../../src/main";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;
const SALT = "integration-salt-0123456789abcdef0123";
let db: DbClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = () => randomUUID().replace(/-/g, "").padEnd(64, "0");

async function workspace(): Promise<{ id: string; user: string }> {
  const { data, error } = await db.auth.admin.createUser({
    email: `analysis-${randomUUID()}@demo.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const id = randomUUID();
  await db
    .from("workspaces")
    .insert({ id, name: "Analysis", created_by: data.user.id })
    .throwOnError();
  await db
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: data.user.id, role: "owner" })
    .throwOnError();
  return { id, user: data.user.id };
}

async function product(name: string): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = `${name.toLowerCase()}-${id.slice(0, 8)}`;
  await db
    .from("saas_products")
    .insert({ id, name, slug, record_status: "active", exclusion_status: "eligible" })
    .throwOnError();
  return { id, slug };
}

function makeWorker() {
  const limits = limitsLoader(db, 0);
  const gateway = new AIGateway({
    provider: new FakeProvider({ ...fakePainPointHandlers, ...fakeOpportunityHandlers }),
    models: FAKE_MODELS,
  });
  return new Worker({
    db,
    workerId: `analysis-${randomUUID().slice(0, 8)}`,
    handlers: {
      feedback_import: feedbackImportHandler({ db, authorHashSecret: SALT, limits }),
      opportunity_analysis: opportunityAnalysisHandler({ db, gateway, limits }),
      report_export: reportExportHandler({ db }),
    },
    leaseSeconds: 5,
    heartbeatSeconds: 1,
    concurrency: 1,
    jobTimeoutSeconds: 120,
    backoff: { baseSeconds: 1, capSeconds: 2, random: () => 0 },
    log: () => undefined,
  });
}

async function waitFor(jobId: string, worker: Worker) {
  for (let i = 0; i < 120; i++) {
    await worker.tick();
    const { data } = await db.from("job_executions").select("*").eq("id", jobId).single();
    if (data && ["completed", "partial", "failed", "cancelled", "dead_letter"].includes(data.state))
      return data;
    await sleep(250);
  }
  throw new Error(`job ${jobId} did not finish`);
}

run("opportunity analyses on the local Supabase stack", () => {
  beforeAll(() => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
  });

  it("runs the customer voice, scores, writes the report and exports it", async () => {
    const ws = await workspace();
    const alpha = await product("Alpha");
    const beta = await product("Beta");
    await db
      .from("competitor_links")
      .insert({
        product_id: alpha.id,
        competitor_product_id: beta.id,
        relationship_type: "indirect",
      })
      .throwOnError();
    const worker = makeWorker();
    const csv = [
      "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company",
      `${alpha.slug},https://reviews.test/x1,Survey,2026-09-01T00:00:00Z,2,5,The CSV export times out on big accounts.,ann@example.com,Shop A`,
      `${alpha.slug},https://reviews.test/x2,Survey,2026-09-03T00:00:00Z,2,5,CSV export keeps timing out for us.,bob@example.com,`,
      `${beta.slug},https://reviews.test/x3,Survey,2026-09-05T00:00:00Z,1,5,Our CSV export times out every time.,cat@example.com,Shop C`,
    ].join("\n");
    const imported = await jobsRepo.requestJob(db, {
      kind: "feedback_import",
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `analysis-import-${randomUUID()}`,
      requestHash: hash(),
      payload: {
        csv,
        row_count: 3,
        rights_declaration: {
          storage: "excerpt",
          author_reference_storage_permitted: true,
          declared_basis: "Our own customer survey export",
        },
      } as never,
    });
    expect((await waitFor(imported.jobId, worker)).state).toBe("completed");

    const requested = await analysisRepo.requestAnalysis(db, {
      workspaceId: ws.id,
      userId: ws.user,
      idempotencyKey: `analysis-${randomUUID()}`,
      requestHash: hash(),
      analysisType: "opportunity",
      subject: { type: "product", product_id: alpha.id },
      request: { analysis_depth: "quick", context: { target_country: "FR" }, options: {} },
    });
    const job = await waitFor(requested.jobId, worker);
    expect(job.state, JSON.stringify(job.last_error_message)).toBe("completed");

    const { data: a } = await db
      .from("opportunity_analyses")
      .select("*")
      .eq("id", requested.analysisId)
      .single();
    expect(a).toMatchObject({ status: "completed", verdict: "validate_first" });
    expect(Number(a?.score_coverage)).toBeLessThan(100);
    expect(a?.score_total).toBeNull();
    const report = a?.report_json as {
      simulated: boolean;
      customer_voice: { clusters: unknown[] };
    };
    expect(report.simulated).toBe(true);
    expect(report.customer_voice.clusters).toHaveLength(1);

    // The nested pain point run (P1–P7 only) is an ordinary, completed workspace run.
    const { data: runs } = await db
      .from("pain_point_runs")
      .select("*")
      .eq("workspace_id", ws.id)
      .contains("parameters", { analysis_id: requested.analysisId });
    expect(runs).toHaveLength(1);
    expect(runs?.[0]).toMatchObject({ status: "completed", opportunities_generated: 0 });

    // Evidence index: subject and competitor feedback, all in scope.
    const { count: indexed } = await db
      .from("analysis_evidence")
      .select("*", { count: "exact", head: true })
      .eq("analysis_id", requested.analysisId);
    expect(indexed).toBeGreaterThanOrEqual(3);
    const { data: dims } = await db
      .from("analysis_dimension_scores")
      .select("dimension_key, assessment_status, rating")
      .eq("analysis_id", requested.analysisId);
    expect(dims).toHaveLength(6);
    const { data: kills } = await db
      .from("analysis_findings")
      .select("severity, is_substantiated")
      .eq("analysis_id", requested.analysisId)
      .eq("finding_type", "kill_criterion");
    expect(kills?.length).toBeGreaterThan(0);

    // Export (Markdown), labelled as simulated.
    const exp = await jobsRepo.requestJob(db, {
      kind: "report_export",
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `analysis-export-${randomUUID()}`,
      requestHash: hash(),
      payload: { analysis_id: requested.analysisId, format: "markdown" } as never,
    });
    expect((await waitFor(exp.jobId, worker)).state).toBe("completed");
    const { data: file } = await db
      .from("report_exports")
      .select("filename, content")
      .eq("job_execution_id", exp.jobId)
      .single();
    expect(file?.filename).toMatch(/\.md$/);
    expect(file?.content).toContain("Données simulées");
    expect(file?.content).toContain("VALIDATE FIRST");

    // A second analysis of the same scope reuses the covering pain point run.
    const again = await analysisRepo.requestAnalysis(db, {
      workspaceId: ws.id,
      userId: ws.user,
      idempotencyKey: `analysis-${randomUUID()}`,
      requestHash: hash(),
      analysisType: "opportunity",
      subject: { type: "product", product_id: alpha.id },
      request: { analysis_depth: "quick" },
    });
    expect((await waitFor(again.jobId, worker)).state).toBe("completed");
    const { data: reuse } = await db
      .from("opportunity_analyses")
      .select("limitations")
      .eq("id", again.analysisId)
      .single();
    expect(JSON.stringify(reuse?.limitations)).toContain("pain_point_run_reused");
  });
});
