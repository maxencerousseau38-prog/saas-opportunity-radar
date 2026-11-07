"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

// PD-31 (7 Nov 2026): at least 12 characters with letters and digits; the
// same rule is configured in Supabase Auth (supabase/config.toml, hosted
// projects: docs/SECURITY_REVIEW.md §5).
const Password = z
  .string()
  .min(12)
  .max(200)
  .regex(/\p{L}/u)
  .regex(/\p{Nd}/u);

export async function setPassword(_prev: string | null, form: FormData): Promise<string | null> {
  const parsed = Password.safeParse(form.get("password"));
  if (!parsed.success)
    return "Le mot de passe doit contenir au moins 12 caractères, dont des lettres et des chiffres.";
  if (form.get("password") !== form.get("confirm")) return "Les deux mots de passe diffèrent.";
  const { client } = await requireUser();
  const { error } = await client.auth.updateUser({ password: parsed.data });
  if (error) return "Le mot de passe n’a pas pu être enregistré.";
  redirect("/");
}
