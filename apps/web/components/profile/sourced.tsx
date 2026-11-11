import type { ReactNode } from "react";
import type { SourcedValue } from "@sor/contracts";
import { Unknown } from "@/components/ui/states";
import { FACT_STATUS, formatDate } from "@/lib/labels";

/** A catalog value with its fact status, verification date and evidence link (PRD §5.3). */
export function Sourced<T>({
  value,
  render,
  unknownLabel,
}: {
  value: SourcedValue<T>;
  render?: (v: T) => ReactNode;
  unknownLabel?: string;
}) {
  if (value.value === null) return <Unknown label={unknownLabel ?? "Inconnu"} />;
  const shown = render ? render(value.value) : String(value.value);
  return (
    <span>
      {shown}{" "}
      <span className="text-xs text-muted">
        ({FACT_STATUS[value.fact_status]}
        {value.verified_at ? `, vérifié le ${formatDate(value.verified_at)}` : ""}
        {value.evidence_ids.length ? (
          <>
            {", "}
            <a className="underline" href={`#evidence-${value.evidence_ids[0]}`}>
              source
            </a>
          </>
        ) : (
          ", source non renseignée"
        )}
        )
      </span>
    </span>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-2 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Section({
  id,
  title,
  children,
  note,
}: {
  id: string;
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}
