"use client";
import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";

export function Menu({
  trigger,
  children,
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <M.Root>
      <M.Trigger asChild aria-label={label}>
        {trigger}
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2"
    >
      {children}
    </M.Item>
  );
}
