import Link from "next/link";
import { isOperator } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "@/app/login/actions";
import { WorkspaceNav } from "@/components/workspace/nav";
import { WorkspaceSwitcher } from "@/components/workspace/switcher";

export default async function WorkspaceLayout(props: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await props.params;
  const { user, membership, memberships } = await requireWorkspace(workspaceId);
  const operator = await isOperator(user.id);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2">
          <Link href={`/w/${workspaceId}/discover`} className="font-semibold">
            SaaS Opportunity Radar
          </Link>
          <WorkspaceSwitcher
            current={workspaceId}
            workspaces={memberships.map((m) => ({ id: m.workspaceId, name: m.name }))}
          />
          <WorkspaceNav workspaceId={workspaceId} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            {operator ? (
              <Link href="/operator" className="text-muted hover:text-fg">
                Opérateur
              </Link>
            ) : null}
            <span className="hidden text-muted sm:inline" title={user.email ?? undefined}>
              {ROLE[membership.role]}
            </span>
            <form action={signOut}>
              <button type="submit" className="text-muted hover:text-fg">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6">{props.children}</div>
    </div>
  );
}
