import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { user } = await requireUser();
  const memberships = await getMemberships(user.id);
  const { new: wantsNew } = await props.searchParams;
  if (memberships.length > 0 && wantsNew !== "1")
    redirect(`/w/${memberships[0]?.workspaceId}/discover`);
  return (
    <AuthShell
      title="Créer ton espace"
      description="Tu en seras le propriétaire. Favoris, collections, recherches et statuts sont propres à chaque espace."
    >
      <OnboardingForm />
    </AuthShell>
  );
}
