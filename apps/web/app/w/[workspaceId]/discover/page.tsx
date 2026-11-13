import { catalogRepo, workspaceRepo } from "@sor/database";
import { CatalogFiltersSchema, CatalogSortSchema, UUIDSchema } from "@sor/contracts";
import { DiscoverView } from "@/components/discover/discover-view";
import { readSettings, toSavedSearchDto } from "@/lib/services/workspace";
import { canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Discover — SaaS Opportunity Radar" };

export default async function DiscoverPage(props: PageProps<"/w/[workspaceId]/discover">) {
  const { workspaceId } = await props.params;
  const { search } = await props.searchParams;
  const { client, membership } = await requireWorkspace(workspaceId);
  const [categories, savedSearches, collections, settings] = await Promise.all([
    catalogRepo.listCategories(client),
    workspaceRepo.listSavedSearches(client, workspaceId),
    workspaceRepo.listCollections(client, workspaceId),
    readSettings(client, workspaceId),
  ]);
  const saved = savedSearches.map(toSavedSearchDto);
  const initial =
    typeof search === "string" && UUIDSchema.safeParse(search).success
      ? saved.find((s) => s.id === search)
      : undefined;
  return (
    <DiscoverView
      key={initial?.id ?? "default"}
      workspaceId={workspaceId}
      canEdit={canEdit(membership.role)}
      categories={categories}
      savedSearches={saved
        .filter((s) => s.kind === "catalog")
        .map((s) => ({ id: s.id, name: s.name }))}
      collections={collections.map((c) => ({ id: c.id, name: c.name }))}
      preferences={settings.research_preferences}
      initialFilters={initial ? initial.filters : CatalogFiltersSchema.parse({})}
      // "Pour vous" by default: renewed at each opening (PD-41).
      initialSort={initial ? CatalogSortSchema.parse(initial.sort_key) : "discovery"}
      initialSearchName={initial?.name ?? null}
    />
  );
}
