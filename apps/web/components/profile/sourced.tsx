import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
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
    <div className="grid gap-0.5 border-b border-border py-2.5 text-sm last:border-0 sm:grid-cols-[minmax(8rem,13rem)_1fr] sm:gap-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
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
      className="scroll-mt-28 rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-tight">
        {title}
      </h2>
      {note ? <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** True when a row value is an explicit unknown (no fact recorded). */
function isUnknownNode(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  if (node.type === Unknown) return true;
  if (node.type === Sourced) {
    const value = (node.props as { value?: { value: unknown } }).value;
    return value?.value === null;
  }
  return false;
}

/**
 * Definition list that keeps known facts as rows and states the unknown ones
 * on a single line: unknown stays explicit without drowning the profile.
 */
export function DetailList({ children }: { children: ReactNode }) {
  const known: ReactElement[] = [];
  const unknown: string[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { label?: string; children?: ReactNode };
    if (props.label && isUnknownNode(props.children)) unknown.push(props.label);
    else known.push(child);
  });
  return (
    <>
      {known.length ? <dl>{known}</dl> : null}
      {unknown.length ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="italic">Inconnu pour l’instant</span> : {unknown.join(" · ")}
        </p>
      ) : null}
    </>
  );
}
