import Link from "next/link";
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
        Connecte-toi pour retrouver tes espaces de travail et tes recherches.
      </p>
      <LoginForm />
      <p className="mt-5 text-center text-sm text-muted">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-fg underline underline-offset-4">
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
