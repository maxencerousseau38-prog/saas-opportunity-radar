"use server";
import { redirect } from "next/navigation";
import { WorkspaceCreateSchema } from "@sor/contracts";
import { createWorkspace, DbError } from "@sor/database";
import { requireUser } from "@/lib/auth";

export async function createWorkspaceAction(
  _prev: string | null,
  form: FormData,
): Promise<string | null> {
  const parsed = WorkspaceCreateSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return "Le nom doit contenir entre 1 et 120 caractères.";
  const { client } = await requireUser();
  let id: string;
  try {
    id = await createWorkspace(client, parsed.data.name);
  } catch (err) {
    if (err instanceof DbError && err.code === "LIMIT_EXCEEDED") {
      return "Vous avez atteint le nombre maximal d’espaces de travail.";
    }
    return "L’espace de travail n’a pas pu être créé.";
  }
  redirect(`/w/${id}/discover`);
}
