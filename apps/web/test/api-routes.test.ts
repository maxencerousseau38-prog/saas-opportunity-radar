// API authorization guard (S7.4b; security review): every route export goes
// through route() / workspaceRoute() (authentication, membership, minimum
// role), operator routes call requireOperator, and the method → minimum role
// map matches the reviewed manifest (Technical Blueprint §11.2,
// Implementation Blueprint §12). Changing a role or adding a route means
// updating test/api-route-manifest.json on purpose.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./api-route-manifest.json";

const API_DIR = fileURLToPath(new URL("../app/api", import.meta.url));
/** Public by design: browsers post CSP reports without credentials. */
const PUBLIC_ROUTES = new Set(["csp-report/route.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

const EXPORT =
  /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([A-Za-z]+)(<[\s\S]*?>)?\(\s*(?:"([a-z]+)")?/g;

function analyse() {
  const roles: Record<string, string> = {};
  const problems: string[] = [];
  for (const file of routeFiles(API_DIR).sort()) {
    const rel = relative(API_DIR, file).split("\\").join("/");
    const src = readFileSync(file, "utf8");
    const declared = [
      ...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g),
    ].map((m) => m[1]);
    const wrapped = new Map<string, string>();
    for (const m of src.matchAll(EXPORT)) {
      if (m[2] === "workspaceRoute") wrapped.set(m[1]!, m[4] ?? "?");
      else if (m[2] === "route")
        wrapped.set(m[1]!, rel.startsWith("v1/operator/") ? "operator" : "authenticated");
    }
    for (const method of declared) {
      const role = wrapped.get(method!);
      if (!role) {
        if (PUBLIC_ROUTES.has(rel)) roles[`${method} ${rel}`] = "public";
        else problems.push(`${method} ${rel}: not wrapped by route() or workspaceRoute()`);
        continue;
      }
      roles[`${method} ${rel}`] = role;
    }
    if (rel.startsWith("v1/operator/") && !/requireOperator\(/.test(src))
      problems.push(`${rel}: operator route without requireOperator()`);
  }
  return { roles, problems };
}

describe("API route guards", () => {
  const { roles, problems } = analyse();

  it("wraps every export and guards every operator route", () => {
    expect(problems).toEqual([]);
  });

  it("matches the reviewed method → minimum role manifest", () => {
    expect(roles).toEqual(manifest);
  });

  it("never lets a viewer change workspace data except leaving it", () => {
    const viewerWrites = Object.entries(roles)
      .filter(([k, r]) => r === "viewer" && !k.startsWith("GET "))
      .map(([k]) => k);
    // Searches are read-only POSTs; DELETE on oneself is "leave the workspace".
    expect(viewerWrites.sort()).toEqual([
      "DELETE v1/workspaces/[workspaceId]/members/[userId]/route.ts",
      "POST v1/workspaces/[workspaceId]/products/search/count/route.ts",
      "POST v1/workspaces/[workspaceId]/products/search/route.ts",
    ]);
  });
});
