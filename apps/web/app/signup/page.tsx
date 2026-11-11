import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Créer un compte — SaaS Opportunity Radar" };

export default async function SignupPage() {
  const { user } = await getSession();
  if (user) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Créer ton compte</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Inscris-toi pour commencer à organiser tes recherches SaaS dans ton propre espace.
      </p>
      <SignupForm />
      <p className="mt-5 text-center text-sm text-muted">
        Tu as déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-fg underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
