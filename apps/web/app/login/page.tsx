import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion — SaaS Opportunity Radar" };

export default async function LoginPage() {
  const { user } = await getSession();
  if (user) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">SaaS Opportunity Radar</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Accès sur invitation uniquement : l’inscription publique est désactivée.
      </p>
      <LoginForm />
    </main>
  );
}
