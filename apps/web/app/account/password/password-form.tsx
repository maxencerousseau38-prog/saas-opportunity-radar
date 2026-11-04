"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { setPassword } from "./actions";

export function PasswordForm() {
  const [error, action, pending] = useActionState(setPassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nouveau mot de passe" htmlFor="password" hint="12 caractères minimum.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      <Field label="Confirmation" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" disabled={pending}>
        Enregistrer
      </Button>
    </form>
  );
}
