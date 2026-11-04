// Workspace repository. Runs with a user client, so RLS and the bootstrap
// function enforce identity and limits (Implementation Blueprint §3 M3).
import type { DbClient } from "../clients";
import { DbError, mapPostgresError } from "../errors";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
}

/** Atomically creates a workspace owned by the calling user; returns its id. */
export async function createWorkspace(client: DbClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_workspace", { p_name: name });
  if (error) throw mapPostgresError(error);
  if (typeof data !== "string") throw new DbError("INTERNAL_ERROR", { data });
  return data;
}

/** Workspaces the given user belongs to, with their role (RLS-scoped). */
export async function listMemberships(
  client: DbClient,
  userId: string,
): Promise<WorkspaceMembership[]> {
  const { data, error } = await client
    .from("workspace_members")
    .select("role, workspaces(id, name)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  if (error) throw mapPostgresError(error);
  return (data ?? []).flatMap((row) =>
    row.workspaces
      ? [{ workspaceId: row.workspaces.id, name: row.workspaces.name, role: row.role }]
      : [],
  );
}
