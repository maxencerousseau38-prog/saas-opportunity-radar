import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default async function OpportunitiesPage(
  props: PageProps<"/w/[workspaceId]/opportunities">,
) {
  const { workspaceId } = await props.params;
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Opportunities</h1>
      <EmptyState title="Pas encore disponible">
        Les problèmes clients récurrents (Sprint 4) et les analyses d’opportunité avec score,
        confiance et verdict (Sprint 5) apparaîtront ici. Vos favoris, collections et statuts sont
        déjà dans{" "}
        <Link className="text-accent underline" href={`/w/${workspaceId}/saved`}>
          Saved
        </Link>
        .
      </EmptyState>
    </section>
  );
}
