import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion — SaaS Opportunity Radar" };

export default async function LoginPage() {
  const { user } = await getSession();
  if (user) redirect("/");
  return (
    <AuthShell
      title="SaaS Opportunity Radar"
      description="Connecte-toi pour retrouver ton feed, tes favoris et tes recherches."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-fg underline underline-offset-4">
            Créer un compte
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
