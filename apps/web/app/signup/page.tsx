import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Créer un compte — SaaS Opportunity Radar" };

export default async function SignupPage() {
  const { user } = await getSession();
  if (user) redirect("/");
  return (
    <AuthShell
      title="Créer ton compte"
      description="Inscris-toi pour découvrir chaque jour de vrais SaaS dans ton propre espace."
      footer={
        <>
          Tu as déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
