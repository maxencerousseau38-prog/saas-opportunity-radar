"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { createWorkspaceAction } from "./actions";

export function OnboardingForm() {
  const [error, action, pending] = useActionState(createWorkspaceAction, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nom de l’espace de travail" htmlFor="name">
        <Input id="name" name="name" required maxLength={120} placeholder="Mon radar SaaS" />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        Créer l’espace de travail
      </Button>
    </form>
  );
}
