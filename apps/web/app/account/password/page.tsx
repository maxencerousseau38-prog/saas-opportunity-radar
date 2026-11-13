import { requireUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  const { user } = await requireUser();
  return (
    <AuthShell title="Définir ton mot de passe" description={user.email}>
      <PasswordForm />
    </AuthShell>
  );
}
