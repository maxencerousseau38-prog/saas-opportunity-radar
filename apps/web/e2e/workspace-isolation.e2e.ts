// S7.5b — F12: workspace isolation through the API (IDOR sweep), guided by
// the route manifest (test/api-route-manifest.json): every export under
// /api/v1/workspaces/{workspaceId}/ is called by the owner of another
// workspace (W1) against the demo workspace (W2), with real W2 identifiers.
//
// (a) W2's paths (W2 workspace ID, W2 resource IDs): 404 everywhere, the
//     workspace's existence is not disclosed, no W2 data in any response.
// (b) W1's own paths with W2's resource IDs (the classic IDOR): reads are
//     404; writes never succeed (no 2xx, no 5xx: 404, or 400 when the body
//     is rejected first); W2's data is unchanged after the sweep.
//
// This file runs last (workers: 1, files in name order), so the earlier
// journeys have filled W2 with runs, clusters, analyses, exports and jobs.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { OWNER } from "./helpers";

type Row = Record<string, unknown>;
const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function rows(table: string, select: string, filter: Row): Promise<Row[]> {
  let q = admin.from(table).select(select);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as string);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

async function first(table: string, select: string, filter: Row, what: string): Promise<Row> {
  const [row] = await rows(table, select, filter);
  if (!row)
    throw new Error(`no ${what} in the demo workspace to probe (earlier journeys missing?)`);
  return row;
}

/** Workspace routes of the manifest: "METHOD path" with [params]. */
function workspaceRoutes(): Array<{ method: string; path: string }> {
  const manifest = JSON.parse(
    readFileSync(new URL("../test/api-route-manifest.json", import.meta.url), "utf8"),
  ) as Record<string, string>;
  return Object.keys(manifest)
    .filter((k) => k.includes(" v1/workspaces/[workspaceId]/"))
    .map((k) => {
      const [method, file] = k.split(" ") as [string, string];
      return { method, path: `/api/${file.replace(/\/route\.ts$/, "")}` };
    });
}

/** Fills the path parameters; `runId` depends on the resource family. */
function fill(path: string, ids: Record<string, string>): string {
  return path.replace(/\[([A-Za-z]+)\]/g, (_, name: string) => {
    if (name === "runId") {
      return path.includes("/discovery-runs/") ? ids.discoveryRunId! : ids.painRunId!;
    }
    const value = ids[name];
    if (!value) throw new Error(`no value for [${name}] in ${path}`);
    return value;
  });
}

async function call(page: Page, method: string, url: string) {
  const options =
    method === "GET" || method === "DELETE"
      ? {}
      : { data: {}, headers: { "idempotency-key": `isolation-${randomUUID()}` } };
  const res = await page.request.fetch(url, { method, ...options });
  return { status: res.status(), body: await res.text() };
}

/** What the sweep must never change in W2. */
async function snapshot(ws: string): Promise<string> {
  const parts = await Promise.all([
    rows("collections", "id, name, description, updated_at", { workspace_id: ws }),
    rows("collection_items", "id, notes", { workspace_id: ws }),
    rows("saved_searches", "id, name, updated_at, is_pinned", { workspace_id: ws }),
    rows("tags", "id, name, color", { workspace_id: ws }),
    rows("tag_assignments", "id", { workspace_id: ws }),
    rows("workspace_members", "user_id, role", { workspace_id: ws }),
    rows("pain_point_clusters", "id, name, review_status", { workspace_id: ws }),
    rows("generated_opportunities", "id, status, notes, is_favorite", { workspace_id: ws }),
    rows("opportunity_analyses", "id", { workspace_id: ws }),
    rows("pain_point_runs", "id", { workspace_id: ws }),
    rows("discovery_runs", "id", { workspace_id: ws }),
    rows("report_exports", "id", { workspace_id: ws }),
    rows("job_executions", "id, cancel_requested_at", { workspace_id: ws }),
    rows("workspaces", "id, name", { id: ws }),
  ]);
  const sorted = parts.map((p) =>
    p.map((r) => JSON.stringify(r)).sort((a, b) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}

test("F12: another workspace's owner gets 404 on every W2 route and cannot reach W2 data", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // ------------------------------------------------ W2: the demo workspace and real IDs
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const demoOwner = users.users.find((u) => u.email === OWNER);
  expect(demoOwner).toBeDefined();
  const w2 = (
    await first("workspaces", "id", { name: "Démo", created_by: demoOwner!.id }, "workspace")
  ).id as string;
  const item = await first(
    "collection_items",
    "id, collection_id",
    { workspace_id: w2 },
    "collection item",
  );
  const exp = await first(
    "report_exports",
    "id, analysis_id",
    { workspace_id: w2 },
    "report export",
  );
  const discoveryRun = await first("discovery_runs", "id", { workspace_id: w2 }, "discovery run");
  const candidate = await first(
    "discovery_candidates",
    "id, run_id",
    { run_id: discoveryRun.id },
    "discovery candidate",
  );
  const cluster = await first("pain_point_clusters", "id, run_id", { workspace_id: w2 }, "cluster");
  const opportunity = await first(
    "generated_opportunities",
    "id",
    { workspace_id: w2 },
    "opportunity",
  );
  const jobRow = await first("job_executions", "id", { workspace_id: w2 }, "job");
  // No journey creates a tag: add one to W2 so its routes are probed with a real ID.
  if ((await rows("tags", "id", { workspace_id: w2 })).length === 0) {
    const { error } = await admin
      .from("tags")
      .insert({ workspace_id: w2, name: "Sonde isolation", created_by: demoOwner!.id });
    expect(error).toBeNull();
  }
  const tag = await first("tags", "id", { workspace_id: w2 }, "tag");
  const search = await first("saved_searches", "id", { workspace_id: w2 }, "saved search");
  const productRow = await first(
    "saas_products",
    "id",
    { record_status: "active", exclusion_status: "eligible" },
    "product",
  );
  const w2Ids: Record<string, string> = {
    workspaceId: w2,
    analysisId: exp.analysis_id as string,
    exportId: exp.id as string,
    clusterId: cluster.id as string,
    collectionId: item.collection_id as string,
    itemId: item.id as string,
    discoveryRunId: candidate.run_id as string,
    candidateId: candidate.id as string,
    painRunId: cluster.run_id as string,
    opportunityId: opportunity.id as string,
    jobId: jobRow.id as string,
    userId: demoOwner!.id,
    searchId: search.id as string,
    tagId: tag.id as string,
    productId: productRow.id as string,
    section: "pricing",
  };
  const secrets = Object.entries(w2Ids)
    .filter(([k]) => !["section", "productId"].includes(k))
    .map(([, v]) => v);

  // ------------------------------------------------ W1: a fresh workspace and its owner
  const email = `isolation-${randomUUID()}@demo.test`;
  const password = `Isolation-${randomUUID()}-1`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const attacker = created.data.user!.id;
  const w1 = randomUUID();
  expect(
    (await admin.from("workspaces").insert({ id: w1, name: "Isolation W1", created_by: attacker }))
      .error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("workspace_members")
        .insert({ workspace_id: w1, user_id: attacker, role: "owner" })
    ).error,
  ).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(new RegExp(`/w/${w1}/discover`));

  const before = await snapshot(w2);
  const routes = workspaceRoutes();
  expect(routes.length).toBeGreaterThan(80); // the whole workspace API, not a sample

  // ------------------------------------------------ (a) W2's own paths
  const leaksA: string[] = [];
  for (const r of routes) {
    const url = fill(r.path, w2Ids);
    const res = await call(page, r.method, url);
    if (res.status !== 404) leaksA.push(`${r.method} ${r.path} → ${res.status}`);
    if (secrets.some((s) => res.body.includes(s)))
      leaksA.push(`${r.method} ${r.path}: W2 data in body`);
  }
  expect(leaksA, "W2 routes reachable from W1").toEqual([]);

  // ------------------------------------------------ (b) W1's paths with W2's resource IDs
  const leaksB: string[] = [];
  let probed = 0;
  for (const r of routes) {
    // Only routes addressing a workspace resource by ID; the catalog
    // (products) is global by design and its per-workspace state is W1's own.
    const params = (r.path.match(/\[[A-Za-z]+\]/g) ?? []).filter((p) => p !== "[workspaceId]");
    if (params.length === 0 || r.path.includes("/products/")) continue;
    probed++;
    const url = fill(r.path, { ...w2Ids, workspaceId: w1 });
    const res = await call(page, r.method, url);
    const ok =
      r.method === "GET"
        ? res.status === 404
        : res.status === 404 || res.status === 400 || res.status === 409 || res.status === 422;
    if (!ok) leaksB.push(`${r.method} ${r.path} → ${res.status}`);
    if (secrets.some((s) => res.body.includes(s)))
      leaksB.push(`${r.method} ${r.path}: W2 data in body`);
  }
  expect(probed).toBeGreaterThan(50);
  expect(leaksB, "W2 resources reachable through W1 paths").toEqual([]);

  // Nothing in W2 changed (no deletion, rename, cancellation, review, role change).
  expect(await snapshot(w2)).toBe(before);
});
