import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { isOperator } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "@/app/login/actions";
import { BottomNav, WorkspaceNav } from "@/components/workspace/nav";
import { WorkspaceSwitcher } from "@/components/workspace/switcher";
import { BrandMark } from "@/components/workspace/brand";

export default async function WorkspaceLayout(props: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await props.params;
  const { user, membership, memberships } = await requireWorkspace(workspaceId);
  const operator = await isOperator(user.id);
  const workspaces = memberships.map((item) => ({ id: item.workspaceId, name: item.name }));
  const email = user.email ?? "Compte utilisateur";

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-bg lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href={"/w/" + workspaceId + "/discover"} className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight">SOR</span>
          </Link>
        </div>
        <div className="px-3">
          <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} className="w-full" />
        </div>
        <div className="mt-5 px-3">
          <WorkspaceNav workspaceId={workspaceId} />
        </div>
        <div className="mt-auto space-y-1 border-t border-border p-3">
          {operator ? (
            <Link
              href="/operator"
              className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2/60 hover:text-fg"
            >
              <ShieldCheck aria-hidden className="size-4" /> Opérateur
            </Link>
          ) : null}
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
              {(email[0] ?? "U").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{email}</span>
              <span className="block text-xs text-muted">{ROLE[membership.role]}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Déconnexion"
                title="Déconnexion"
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              >
                <LogOut aria-hidden className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Phone top bar: scrolls away, the page keeps its own sticky tools. */}
        <header className="pt-safe lg:hidden">
          <div className="flex h-12 items-center gap-2.5 px-4">
            <Link href={"/w/" + workspaceId + "/discover"} className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span className="text-[15px] font-semibold tracking-tight">SOR</span>
            </Link>
            <span className="ml-auto max-w-[50%] truncate text-xs text-muted">
              {membership.name}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
          {props.children}
        </main>
      </div>

      <BottomNav
        workspaceId={workspaceId}
        workspaces={workspaces}
        operator={operator}
        email={email}
        roleLabel={ROLE[membership.role] ?? membership.role}
        signOutAction={signOut}
      />
    </div>
  );
}
