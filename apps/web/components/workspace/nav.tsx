"use client";

import { Bookmark, Compass, Radar, Settings2, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "discover", label: "Discover", icon: Compass },
  { href: "ask-ai", label: "Ask AI", icon: Sparkles },
  { href: "ai-discovery", label: "AI Discovery", icon: Radar },
  { href: "opportunities", label: "Opportunities", icon: Target },
  { href: "saved", label: "Saved", icon: Bookmark },
  { href: "settings", label: "Settings", icon: Settings2 },
] as const;

export function WorkspaceNav({
  workspaceId,
  orientation = "horizontal",
}: {
  workspaceId: string;
  orientation?: "horizontal" | "vertical";
}) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(vertical ? "grid gap-1" : "flex min-w-max gap-1")}
    >
      {ITEMS.map((item) => {
        const href = "/w/" + workspaceId + "/" + item.href;
        const active = pathname === href || pathname.startsWith(href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md border text-sm transition-colors",
              vertical ? "w-full px-3 py-2.5" : "shrink-0 px-3 py-2",
              active
                ? "border-border bg-surface-2 font-medium text-fg shadow-sm"
                : "border-transparent text-muted hover:bg-surface-2/70 hover:text-fg",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                active ? "text-fg" : "text-muted group-hover:text-fg",
              )}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
