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
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-56 animate-pop rounded-xl border border-border bg-surface/95 p-1.5 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl"
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
      className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-2 sm:min-h-9"
    >
      {children}
    </M.Item>
  );
}
