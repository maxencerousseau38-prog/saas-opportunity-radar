"use client";
// Operator MFA gate (PD-30, S7.4e): first enrolment of an authenticator app,
// then a 6-digit code at every new session.
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { startEnrollment, verifyCode, type Enrollment } from "@/app/operator/mfa-actions";

function CodeForm({ factorId, label }: { factorId: string; label: string }) {
  const [error, action, pending] = useActionState(verifyCode, null);
  return (
    <form action={action} className="space-y-3" aria-label="Code de vérification">
      <input type="hidden" name="factorId" value={factorId} />
      <Field label={label} htmlFor="mfa-code" hint="6 chiffres, renouvelés toutes les 30 secondes.">
        <Input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" disabled={pending}>
        Vérifier
      </Button>
    </form>
  );
}

export function OperatorMfa({ factorId }: { factorId: string | null }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (factorId) {
    return (
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-base font-semibold">Vérification en deux étapes</h2>
        <p className="text-sm text-muted">
          La console opérateur exige un code de votre application d’authentification.
        </p>
        <CodeForm factorId={factorId} label="Code de l’application" />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">Activer la vérification en deux étapes</h2>
      <p className="text-sm text-muted">
        La console opérateur exige une application d’authentification (TOTP). Elle sera demandée à
        chaque nouvelle session.
      </p>
      {enrollment ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code data URL from Supabase Auth */}
          <img src={enrollment.qrCode} alt="QR code à scanner" width={180} height={180} />
          <p className="text-sm">
            Ou saisissez cette clé dans l’application :{" "}
            <code data-testid="totp-secret" className="break-all">
              {enrollment.secret}
            </code>
          </p>
          <CodeForm factorId={enrollment.factorId} label="Code affiché par l’application" />
        </div>
      ) : (
        <>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const result = await startEnrollment();
              setPending(false);
              if ("error" in result) setError(result.error);
              else setEnrollment(result);
            }}
          >
            Configurer l’application d’authentification
          </Button>
        </>
      )}
    </section>
  );
}
