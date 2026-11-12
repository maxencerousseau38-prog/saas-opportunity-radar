"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { signUp } from "./actions";

interface SignUpState {
  success: boolean;
  error: string | null;
}

const initialState: SignUpState | null = null;

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initialState);

  if (state?.success) {
    return (
      <section className="space-y-3" aria-live="polite">
        <h2 className="text-base font-semibold">Vérifie ta boîte e-mail</h2>
        <p className="text-sm text-muted">
          Si cette adresse peut être utilisée, un e-mail de confirmation vient d’être envoyé. Clique
          sur son lien pour activer ton compte, puis tu pourras créer ton premier espace de travail.
          Pense aussi à vérifier les courriers indésirables.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium underline underline-offset-4"
        >
          Retour à la connexion
        </Link>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={320} />
      </Field>
      <Field
        label="Mot de passe"
        htmlFor="password"
        hint="12 caractères minimum, avec au moins une lettre et un chiffre."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
        />
      </Field>
      <Field label="Confirmer le mot de passe" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
        />
      </Field>
      {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-xs text-muted">
        En créant un compte, tu acceptes que ton espace de travail reste privé à ses membres.
      </p>
    </form>
  );
}
