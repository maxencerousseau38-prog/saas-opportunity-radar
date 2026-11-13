"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Modal dialog: a bottom sheet on phones (thumb reach, safe area), a centred
 * card from the `sm` breakpoint.
 */
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
        <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/60 backdrop-blur-[2px]" />
        <D.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] animate-sheet-up overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop sm:rounded-2xl sm:border-b sm:p-6">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
          <D.Title className="pr-8 text-lg font-semibold tracking-tight">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <D.Close
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:top-4 sm:right-4"
            aria-label="Fermer"
          >
            <X size={18} />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
