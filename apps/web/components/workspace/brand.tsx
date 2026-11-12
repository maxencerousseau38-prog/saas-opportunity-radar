import { cn } from "@/lib/utils";

/** SOR mark: a monochrome radar sweep (same drawing as app/icon.svg). */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-[28%] bg-accent text-accent-fg",
        size === "sm" ? "size-7" : size === "lg" ? "size-12" : "size-8",
      )}
    >
      <svg viewBox="0 0 64 64" className="size-[68%]">
        <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
          <path d="M32 14a18 18 0 1 0 18 18" />
          <path d="M32 22a10 10 0 1 0 10 10" />
          <path d="M32 32 46 18" />
        </g>
        <circle cx="32" cy="32" r="4.5" fill="currentColor" />
      </svg>
    </span>
  );
}
