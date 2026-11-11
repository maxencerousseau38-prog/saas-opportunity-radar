import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { user } = await requireUser();
  const memberships = await getMemberships(user.id);
  const { new: wantsNew } = await props.searchParams;
  if (memberships.length > 0 && wantsNew !== "1")
    redirect(`/w/${memberships[0]?.workspaceId}/discover`);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-xl font-semibold">Créer un espace de travail</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Vous en serez le propriétaire. Les collections, recherches sauvegardées et statuts sont
        propres à chaque espace.
      </p>
      <OnboardingForm />
    </main>
  );
}
