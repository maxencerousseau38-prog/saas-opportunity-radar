"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Main navigation (PRD §2): labels kept in English as in the PRD.
const ITEMS = [
  { href: "discover", label: "Discover" },
  { href: "ask-ai", label: "Ask AI" },
  { href: "ai-discovery", label: "AI Discovery" },
  { href: "opportunities", label: "Opportunities" },
  { href: "saved", label: "Saved" },
  { href: "settings", label: "Settings" },
];

export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap gap-1">
      {ITEMS.map((item) => {
        const href = `/w/${workspaceId}/${item.href}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm",
              active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
