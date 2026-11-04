import { describe, expect, it } from "vitest";
import type { DbClient } from "../clients";
import { DbError } from "../errors";
import { createWorkspace, listMemberships } from "../repositories/workspaces";

// Minimal stand-ins for the supabase-js query builder; integration tests against
// the local stack cover the real behaviour (supabase/tests).
function rpcClient(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
  };
  return { client: client as unknown as DbClient, calls };
}

function selectClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: async () => result,
  };
  return { from: () => builder } as unknown as DbClient;
}

describe("createWorkspace", () => {
  it("calls the atomic bootstrap function and returns the new id", async () => {
    const { client, calls } = rpcClient({
      data: "00000000-0000-4000-8000-0000000000b1",
      error: null,
    });
    await expect(createWorkspace(client, "Mon espace")).resolves.toBe(
      "00000000-0000-4000-8000-0000000000b1",
    );
    expect(calls).toEqual([{ fn: "create_workspace", args: { p_name: "Mon espace" } }]);
  });

  it("maps the platform limit to LIMIT_EXCEEDED", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "54000", message: "LIMIT_EXCEEDED" },
    });
    await expect(createWorkspace(client, "Sixth")).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
  });

  it("rejects an unexpected response shape", async () => {
    const { client } = rpcClient({ data: 42, error: null });
    await expect(createWorkspace(client, "x")).rejects.toBeInstanceOf(DbError);
  });
});

describe("listMemberships", () => {
  it("returns memberships and skips rows whose workspace is not visible", async () => {
    const client = selectClient({
      data: [
        { role: "owner", workspaces: { id: "w1", name: "W1" } },
        { role: "viewer", workspaces: null },
      ],
      error: null,
    });
    await expect(listMemberships(client, "u1")).resolves.toEqual([
      { workspaceId: "w1", name: "W1", role: "owner" },
    ]);
  });

  it("maps RLS denials to FORBIDDEN", async () => {
    const client = selectClient({ data: null, error: { code: "42501", message: "denied" } });
    await expect(listMemberships(client, "u1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
