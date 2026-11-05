// Evaluation cases of the PD-24a benchmark (evals/README.md): one normalised
// shape for the Sprint 3 synthetic fixtures, the adversarial cases and the
// annotated real sites (frozen snapshots). Pure data mapping, no I/O.

export interface Matcher {
  label: string;
  /** Lowercase substrings; one must appear in the reported item. */
  any: string[];
}

export interface ExpectedPlan {
  name: string;
  name_any: string[];
  /** Displayed amounts; `null` = plan shown without a price. */
  price_amount_any: Array<number | null>;
  currency: string | null;
  billing_period_any: string[];
}

export interface ExpectedField {
  field_key: string;
  value: unknown;
}

export interface EvalCase {
  id: string;
  kind: "synthetic" | "adversarial" | "real";
  product: { name: string; website_url: string };
  /** url → text; the first entry is the home page. */
  pages: Record<string, string>;
  /** Same-site links of the home page (drive page selection). */
  links: string[];
  expected: {
    plans: ExpectedPlan[];
    features: Matcher[];
    integrations: Matcher[];
    fields: ExpectedField[];
    min_conflicts?: number;
    warnings_any?: string[];
  };
  forbidden: {
    fields?: string[];
    texts?: string[];
    monetization_signals?: string[];
    plan_names?: string[];
    features_any?: string[];
    enterprise_plans?: string[];
  };
  expected_exclusion: "eligible" | "needs_review" | "excluded";
}

type Raw = Record<string, unknown>;
const lower = (s: string) => s.toLowerCase();

/** Sprint 3 synthetic fixtures (evals/enrichment/fixtures.json). */
export function fromSyntheticFixture(f: Raw): EvalCase {
  const pages = f.pages as Record<string, string>;
  const expected = f.expected as { pricing: Array<[string, number]>; features: string[] };
  return {
    id: String(f.id),
    kind: "synthetic",
    product: { name: String(f.label), website_url: Object.keys(pages)[0] ?? "" },
    pages,
    links: (f.links as string[]) ?? [],
    expected: {
      plans: expected.pricing.map(([name, amount]) => ({
        name,
        name_any: [lower(name)],
        price_amount_any: [amount],
        currency: null,
        billing_period_any: [],
      })),
      features: expected.features.map((x) => ({ label: x, any: [lower(x)] })),
      integrations: [],
      fields: [],
    },
    forbidden: (f.forbidden as EvalCase["forbidden"]) ?? {},
    expected_exclusion: f.expected_exclusion as EvalCase["expected_exclusion"],
  };
}

/** Adversarial cases (evals/enrichment/adversarial.json). */
export function fromAdversarialCase(f: Raw): EvalCase {
  const exp = f.expected as Raw;
  const plans = (exp.plans as Raw[] | undefined) ?? [];
  return {
    id: String(f.id),
    kind: "adversarial",
    product: f.product as EvalCase["product"],
    pages: f.pages as Record<string, string>,
    links: (f.links as string[]) ?? [],
    expected: {
      plans: plans.map((p) => ({
        name: String(p.name),
        name_any: [lower(String(p.name))],
        price_amount_any: [p.price_amount as number | null],
        currency: (p.currency as string | null) ?? null,
        billing_period_any: p.billing_period ? [String(p.billing_period)] : [],
      })),
      features: (exp.features as Matcher[] | undefined) ?? [],
      integrations: [],
      fields: Object.entries((exp.fields as Raw | undefined) ?? {}).map(([field_key, value]) => ({
        field_key,
        value,
      })),
      ...(typeof exp.min_conflicts === "number" ? { min_conflicts: exp.min_conflicts } : {}),
      ...(Array.isArray(exp.warnings_any) ? { warnings_any: exp.warnings_any as string[] } : {}),
    },
    forbidden: (f.forbidden as EvalCase["forbidden"]) ?? {},
    expected_exclusion: f.expected_exclusion as EvalCase["expected_exclusion"],
  };
}

/** A real site: frozen snapshot + annotation (evals/enrichment/real). */
export function fromRealSite(site: Raw, snapshot: Raw, annotation: Raw): EvalCase {
  const pages: Record<string, string> = {};
  for (const p of snapshot.pages as Raw[]) pages[String(p.requested_url)] = String(p.text);
  const strip = <T extends Raw>(items: T[] | undefined) =>
    (items ?? []).map((i) => {
      const copy: Raw = { ...i };
      delete copy.quote;
      delete copy.page;
      return copy;
    });
  return {
    id: String(site.id),
    kind: "real",
    product: { name: String(site.name ?? site.id), website_url: String(site.url) },
    pages,
    links: (snapshot.home_links as string[]) ?? [],
    expected: {
      plans: strip(annotation.plans as Raw[]) as unknown as ExpectedPlan[],
      features: strip(annotation.features as Raw[]) as unknown as Matcher[],
      integrations: strip(annotation.integrations as Raw[]) as unknown as Matcher[],
      fields: strip(annotation.fields as Raw[]) as unknown as ExpectedField[],
    },
    forbidden: (annotation.forbidden as EvalCase["forbidden"]) ?? {},
    expected_exclusion: annotation.expected_exclusion as EvalCase["expected_exclusion"],
  };
}
