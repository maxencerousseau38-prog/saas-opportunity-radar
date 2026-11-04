import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { UUIDSchema } from "@sor/contracts";
import { getMemberships, requireUser } from "@/lib/auth";

/** Membership of the signed-in user in the workspace of the URL, or 404. */
export const requireWorkspace = cache(async (workspaceId: string) => {
  const { client, user } = await requireUser();
  if (!UUIDSchema.safeParse(workspaceId).success) notFound();
  const memberships = await getMemberships(user.id);
  const membership = memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) notFound();
  return { client, user, membership, memberships };
});

export const canEdit = (role: string) => role !== "viewer";
export const canAdmin = (role: string) => role === "owner" || role === "admin";
