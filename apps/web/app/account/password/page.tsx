import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  const { user } = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-semibold">Définir votre mot de passe</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{user.email}</p>
      <PasswordForm />
    </main>
  );
}
