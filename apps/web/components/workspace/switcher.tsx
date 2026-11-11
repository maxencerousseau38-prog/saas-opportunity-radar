"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({
  current,
  workspaces,
  className,
}: {
  current: string;
  workspaces: Array<{ id: string; name: string }>;
  className?: string;
}) {
  const router = useRouter();

  return (
    <select
      aria-label="Espace de travail"
      value={current}
      onChange={(e) =>
        router.push(
          e.target.value === "__new" ? "/onboarding?new=1" : "/w/" + e.target.value + "/discover",
        )
      }
      className={cn(
        "h-9 rounded-md border border-border bg-surface-2 px-3 text-sm text-fg transition-colors hover:border-white/20",
        className,
      )}
    >
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
      <option value="__new">+ Nouvel espace…</option>
    </select>
  );
}
