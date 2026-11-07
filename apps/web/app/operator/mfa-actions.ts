"use server";
// Operator MFA (PD-30, S7.4e): TOTP enrolment and verification. The session
// becomes AAL2 after a verified code; the operator console and API require it.
import { redirect } from "next/navigation";
import { z } from "zod";
import { isOperator, requireUser } from "@/lib/auth";

export interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Starts a TOTP enrolment (operators only); stale unverified factors are removed first. */
export async function startEnrollment(): Promise<Enrollment | { error: string }> {
  const { client, user } = await requireUser();
  if (!(await isOperator(user.id))) return { error: "Action non autorisée." };
  const listed = await client.auth.mfa.listFactors();
  if (listed.error) return { error: "Impossible de préparer la vérification en deux étapes." };
  if (listed.data.totp.length > 0) return { error: "Une application est déjà enregistrée." };
  for (const f of listed.data.all.filter(
    (f) => f.factor_type === "totp" && f.status !== "verified",
  ))
    await client.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Console opérateur",
  });
  if (error || !data) return { error: "Impossible de préparer la vérification en deux étapes." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const VerifySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

/** Verifies a 6-digit code (enrolment or sign-in challenge); success upgrades the session to AAL2. */
export async function verifyCode(_prev: string | null, form: FormData): Promise<string | null> {
  const parsed = VerifySchema.safeParse({
    factorId: form.get("factorId"),
    code: String(form.get("code") ?? "").replace(/\s+/g, ""),
  });
  if (!parsed.success) return "Saisissez le code à 6 chiffres de votre application.";
  const { client, user } = await requireUser();
  if (!(await isOperator(user.id))) return "Action non autorisée.";
  const { error } = await client.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return "Code incorrect ou expiré.";
  redirect("/operator");
}
