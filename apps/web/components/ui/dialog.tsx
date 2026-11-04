"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <D.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <D.Close
            className="absolute top-3 right-3 rounded p-1 text-muted hover:text-fg"
            aria-label="Fermer"
          >
            <X size={16} />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
