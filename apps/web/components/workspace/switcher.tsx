"use client";
import { useRouter } from "next/navigation";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Espace de travail"
      value={current}
      onChange={(e) =>
        router.push(
          e.target.value === "__new" ? "/onboarding?new=1" : `/w/${e.target.value}/discover`,
        )
      }
      className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
      <option value="__new">+ Nouvel espace…</option>
    </select>
  );
}
