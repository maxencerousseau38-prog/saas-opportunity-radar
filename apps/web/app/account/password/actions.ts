"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const Password = z.string().min(12).max(200);

export async function setPassword(_prev: string | null, form: FormData): Promise<string | null> {
  const parsed = Password.safeParse(form.get("password"));
  if (!parsed.success) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (form.get("password") !== form.get("confirm")) return "Les deux mots de passe diffèrent.";
  const { client } = await requireUser();
  const { error } = await client.auth.updateUser({ password: parsed.data });
  if (error) return "Le mot de passe n’a pas pu être enregistré.";
  redirect("/");
}
