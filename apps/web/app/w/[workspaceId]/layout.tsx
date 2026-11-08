import Link from "next/link";
import { LogOut, Radar } from "lucide-react";
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
  const workspaces = memberships.map((item) => ({ id: item.workspaceId, name: item.name }));

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link
            href={"/w/" + workspaceId + "/discover"}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
              <Radar aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">
                SaaS Opportunity Radar
              </span>
              <span className="block text-xs text-muted">Research workspace</span>
            </span>
          </Link>
        </div>

        <div className="space-y-2 px-4 py-5">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Workspace
          </p>
          <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} className="w-full" />
        </div>

        <div className="px-3 pt-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Research
          </p>
          <WorkspaceNav workspaceId={workspaceId} orientation="vertical" />
        </div>

        <div className="mt-auto border-t border-border p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-fg">
              {(user.email?.[0] ?? "U").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">
                {user.email ?? "Compte utilisateur"}
              </span>
              <span className="block text-xs text-muted">{ROLE[membership.role]}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link
              href={"/w/" + workspaceId + "/discover"}
              className="flex min-w-0 items-center gap-2 font-semibold tracking-tight lg:hidden"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
                <Radar aria-hidden="true" className="size-4" />
              </span>
              <span className="truncate text-sm">SaaS Opportunity Radar</span>
            </Link>

            <span className="hidden text-sm text-muted lg:block">Research workspace</span>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <WorkspaceSwitcher
                current={workspaceId}
                workspaces={workspaces}
                className="w-[min(11rem,38vw)] lg:hidden"
              />
              {operator ? (
                <Link
                  href="/operator"
                  className="hidden text-sm text-muted transition-colors hover:text-fg sm:inline"
                >
                  Opérateur
                </Link>
              ) : null}
              <span className="hidden text-xs text-muted sm:inline">{ROLE[membership.role]}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  <span className="hidden sm:inline">Déconnexion</span>
                </button>
              </form>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-border px-3 py-2 lg:hidden">
            <WorkspaceNav workspaceId={workspaceId} orientation="horizontal" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {props.children}
        </main>
      </div>
    </div>
  );
}
