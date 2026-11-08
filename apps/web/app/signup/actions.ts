"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUserServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

interface SignUpState {
  success: boolean;
  error: string | null;
}

const Password = z
  .string()
  .min(12)
  .max(200)
  .regex(/\p{L}/u)
  .regex(/\p{Nd}/u);

const Credentials = z.object({
  email: z.string().trim().email().max(320),
  password: Password,
  confirm: z.string().min(1).max(200),
});

export async function signUp(_previous: SignUpState | null, form: FormData): Promise<SignUpState> {
  const parsed = Credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    confirm: form.get("confirm"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error:
        "Vérifie ton adresse e-mail et ton mot de passe (12 caractères minimum, avec lettres et chiffres).",
    };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { success: false, error: "Les deux mots de passe ne correspondent pas." };
  }

  const client = await createUserServerClient();
  const configuredSiteUrl = getServerEnv().SITE_URL ?? "http://localhost:3000";
  const emailRedirectTo = new URL("/login", configuredSiteUrl).toString();
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo },
  });

  if (error) {
    return {
      success: false,
      error:
        error.status === 429
          ? "Les e-mails de confirmation sont temporairement limités. Réessaie plus tard."
          : "Impossible de créer le compte pour le moment. Vérifie les informations et réessaie plus tard.",
    };
  }

  // If email confirmation is disabled in Supabase, the user already has a
  // session and can proceed. With confirmation enabled, show the neutral
  // success state (also avoids revealing whether an address already exists).
  if (data.session) redirect("/");

  return { success: true, error: null };
}
