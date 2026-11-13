import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/workspace/brand";

/** Centered, phone-first frame shared by sign-in, sign-up and onboarding. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col bg-bg px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,oklch(1_0_0/7%),transparent)]"
      />
      <Link href="/" className="relative flex items-center gap-2 self-start">
        <BrandMark size="sm" />
        <span className="text-[15px] font-semibold tracking-tight">SOR</span>
      </Link>
      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 mb-7 text-[15px] text-muted">{description}</p>
        {children}
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
