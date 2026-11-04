import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/auth";

export default async function HomePage() {
  const { user } = await requireUser();
  const memberships = await getMemberships(user.id);
  const first = memberships[0];
  redirect(first ? `/w/${first.workspaceId}/discover` : "/onboarding");
}
