import { catalogRepo, workspaceRepo } from "@sor/database";
import { SettingsView } from "@/components/workspace/settings-view";
import { listSources } from "@/lib/services/discovery";
import { workspaceUsage } from "@/lib/services/jobs";
import { readSettings } from "@/lib/services/workspace";
import { canAdmin, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Settings — SaaS Opportunity Radar" };

export default async function SettingsPage(props: PageProps<"/w/[workspaceId]/settings">) {
  const { workspaceId } = await props.params;
  const { client, user, membership } = await requireWorkspace(workspaceId);
  const [members, settings, sources, categories, usage] = await Promise.all([
    workspaceRepo.listMemberDirectory(client, workspaceId),
    readSettings(client, workspaceId),
    listSources(),
    catalogRepo.listCategories(client),
    workspaceUsage(workspaceId, user.id),
  ]);
  return (
    <SettingsView
      workspaceId={workspaceId}
      workspaceName={membership.name}
      userId={user.id}
      role={membership.role}
      canAdmin={canAdmin(membership.role)}
      members={members.map((m) => ({
        user_id: m.user_id,
        email: m.email,
        role: m.role,
        joined_at: m.joined_at,
      }))}
      preferences={settings.research_preferences}
      invalidSettings={settings.invalid_fields}
      sources={sources.data}
      usage={usage}
      categories={categories
        .filter((c) => c.parent_id !== null)
        .map((c) => ({ slug: c.slug, name: c.name }))}
    />
  );
}
