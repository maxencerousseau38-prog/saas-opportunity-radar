import { workspaceRepo } from "@sor/database";
import { SavedView } from "@/components/workspace/saved-view";
import { toSavedSearchDto } from "@/lib/services/workspace";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Saved — SaaS Opportunity Radar" };

export default async function SavedPage(props: PageProps<"/w/[workspaceId]/saved">) {
  const { workspaceId } = await props.params;
  const { client, user, membership } = await requireWorkspace(workspaceId);
  const [collections, favorites, hidden, searches, tags, reports] = await Promise.all([
    workspaceRepo.listCollections(client, workspaceId),
    workspaceRepo.listFavorites(client, workspaceId),
    workspaceRepo.listHidden(client, workspaceId),
    workspaceRepo.listSavedSearches(client, workspaceId),
    workspaceRepo.listTags(client, workspaceId),
    workspaceRepo.listWorkspaceReports(client, workspaceId),
  ]);
  const product = (p: { id: string; slug: string; name: string; tagline: string | null } | null) =>
    p ? { id: p.id, slug: p.slug, name: p.name, tagline: p.tagline } : null;
  return (
    <SavedView
      workspaceId={workspaceId}
      userId={user.id}
      canEdit={canEdit(membership.role)}
      canAdmin={canAdmin(membership.role)}
      collections={collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        items: c.collection_items.flatMap((i) => {
          const p = product(i.saas_products);
          return p ? [{ id: i.id, notes: i.notes, product: p }] : [];
        }),
      }))}
      favorites={favorites.flatMap((f) =>
        product(f.saas_products) ? [product(f.saas_products)!] : [],
      )}
      hidden={hidden.flatMap((f) => (product(f.saas_products) ? [product(f.saas_products)!] : []))}
      searches={searches.map(toSavedSearchDto).map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        is_pinned: s.is_pinned,
        created_by: s.created_by,
        invalid: s.invalid,
      }))}
      tags={tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        count: t.tag_assignments.length,
      }))}
      reports={reports.map((r) => ({
        id: r.id,
        product: r.saas_products?.name ?? "SaaS non visible",
        type: r.report_type,
        message: r.message,
        status: r.status,
        note: r.resolution_note,
        created_at: r.created_at,
      }))}
    />
  );
}
