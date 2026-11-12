"use client";

import { useState } from "react";
import {
  Bookmark,
  Compass,
  LogOut,
  Menu as MenuIcon,
  Radar,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./switcher";

const ITEMS = [
  { href: "discover", label: "Discover", icon: Compass, primary: true },
  { href: "saved", label: "Saved", icon: Bookmark, primary: true },
  { href: "ask-ai", label: "Ask AI", icon: Sparkles, primary: true },
  { href: "opportunities", label: "Opportunities", icon: Target, primary: true },
  { href: "ai-discovery", label: "AI Discovery", icon: Radar, primary: false },
  { href: "settings", label: "Settings", icon: Settings2, primary: false },
] as const;

function useActive(workspaceId: string) {
  const pathname = usePathname();
  return (href: string) => {
    const full = "/w/" + workspaceId + "/" + href;
    // A product profile belongs to Discover.
    if (href === "discover" && pathname.startsWith("/w/" + workspaceId + "/saas/")) return true;
    return pathname === full || pathname.startsWith(full + "/");
  };
}

/** Desktop sidebar navigation. */
export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const isActive = useActive(workspaceId);
  return (
    <nav aria-label="Navigation principale" className="grid gap-0.5">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={"/w/" + workspaceId + "/" + item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              active
                ? "bg-surface-2 font-medium text-fg"
                : "text-muted hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone navigation: a bottom tab bar within thumb reach, above the iPhone home
 * indicator. Secondary destinations live in the "Plus" sheet.
 */
export function BottomNav({
  workspaceId,
  workspaces,
  operator,
  email,
  roleLabel,
  signOutAction,
}: {
  workspaceId: string;
  workspaces: Array<{ id: string; name: string }>;
  operator: boolean;
  email: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const isActive = useActive(workspaceId);
  const [open, setOpen] = useState(false);
  const secondaryActive = ITEMS.some((i) => !i.primary && isActive(i.href));

  return (
    <>
      <nav
        aria-label="Navigation mobile"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {ITEMS.filter((i) => i.primary).map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={"/w/" + workspaceId + "/" + item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
                    active ? "text-fg" : "text-muted active:text-fg",
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn("size-[22px]", active && "fill-fg/15")}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  <span className="max-w-full truncate px-1">
                    {item.label === "Opportunities" ? "Opport." : item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium",
                secondaryActive ? "text-fg" : "text-muted",
              )}
            >
              <MenuIcon aria-hidden className="size-[22px]" strokeWidth={1.8} />
              Plus
            </button>
          </li>
        </ul>
      </nav>

      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/60 lg:hidden" />
          <D.Content className="pb-safe fixed inset-x-0 bottom-0 z-50 animate-sheet-up rounded-t-2xl border border-b-0 border-border bg-surface px-4 pt-3 lg:hidden">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />
            <div className="flex items-center justify-between">
              <D.Title className="text-base font-semibold">Plus</D.Title>
              <D.Close
                aria-label="Fermer"
                className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
              >
                <X size={18} />
              </D.Close>
            </div>
            <D.Description className="sr-only">
              Espace de travail, autres pages et compte
            </D.Description>
            <div className="mt-3 space-y-1.5">
              <p className="px-1 text-xs font-medium text-muted">Espace de travail</p>
              <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} className="w-full" />
            </div>
            <ul className="mt-4 overflow-hidden rounded-xl border border-border bg-bg/40">
              {ITEMS.filter((i) => !i.primary).map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href} className="border-b border-border last:border-0">
                    <Link
                      href={"/w/" + workspaceId + "/" + item.href}
                      onClick={() => setOpen(false)}
                      className="flex h-12 items-center gap-3 px-4 text-[15px] active:bg-surface-2"
                    >
                      <Icon aria-hidden className="size-5 text-muted" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {operator ? (
                <li>
                  <Link
                    href="/operator"
                    onClick={() => setOpen(false)}
                    className="flex h-12 items-center gap-3 px-4 text-[15px] active:bg-surface-2"
                  >
                    <ShieldCheck aria-hidden className="size-5 text-muted" />
                    Opérateur
                  </Link>
                </li>
              ) : null}
            </ul>
            <div className="mt-4 mb-4 flex items-center gap-3 rounded-xl border border-border px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold">
                {(email[0] ?? "U").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{email}</span>
                <span className="block text-xs text-muted">{roleLabel}</span>
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted active:bg-surface-2"
                >
                  <LogOut aria-hidden className="size-4" /> Déconnexion
                </button>
              </form>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
