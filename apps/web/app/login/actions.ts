"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUserServerClient } from "@/lib/supabase/server";

const Credentials = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const parsed = Credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return "Adresse e-mail ou mot de passe invalide.";
  const client = await createUserServerClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  // Same message for every failure: no account enumeration.
  if (error) return "Identifiants incorrects.";
  redirect("/");
}

export async function signOut(): Promise<void> {
  const client = await createUserServerClient();
  await client.auth.signOut();
  redirect("/login");
}
