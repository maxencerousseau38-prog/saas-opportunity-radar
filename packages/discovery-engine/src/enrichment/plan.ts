// Turns verified D5 output into the atomic application plan of
// `sor_apply_enrichment`: evidence, selected values, provenance, conflicts,
// features, integrations, pricing and the §5.4 re-classification.
import { COMPANY_FIELD_KEYS, type EnrichmentFieldKey, type EnrichmentOutput } from "@sor/contracts";
import { classifyExclusion, detectConflicts, selectClaim, type ClaimCandidate } from "@sor/domain";
import type { EnrichmentPlan, ExistingClaim, PlanEvidence, ProductContext } from "./types";
import type { VerifiedItem } from "./verify";

export function claimTypeForField(field: string): string {
  switch (field) {
    case "billing_models":
    case "pricing_status":
      return "pricing";
    case "languages":
      return "language";
    case "launch_year":
    case "founded_year":
      return "founding_year";
    case "country_code":
    case "city":
      return "headquarters";
    case "employee_min":
    case "employee_max":
      return "employee_count";
    case "legal_name":
    case "founder_led":
    case "linkedin_url":
      return "company_profile";
    case "documentation_url":
    case "technology_tags":
      return "platform";
    case "served_countries":
      return "market_presence";
    default:
      return "product_description";
  }
}

const isKey = (id: string) => /^e\d+$/.test(id);

export function buildPlan(
  output: EnrichmentOutput,
  verified: VerifiedItem[],
  existing: ExistingClaim[],
  product: ProductContext,
  now: Date,
): { plan: EnrichmentPlan; fieldsUpdated: string[]; conflicts: number } {
  const evidence: PlanEvidence[] = [];
  const keyOf = new Map<string, string>(); // ref -> evidence key
  const observedAt = now.toISOString();

  for (const v of verified) {
    if (v.status === "rejected" || !v.snapshot) continue;
    const key = `e${evidence.length + 1}`;
    keyOf.set(v.ref, key);
    const verifiedAt = v.status === "verified" ? observedAt : null;
    const common = {
      key,
      source_snapshot_id: v.snapshot.snapshot_id,
      reliability_level: 1 as const,
      verification_status: v.status as PlanEvidence["verification_status"],
      verified_at: verifiedAt,
      published_at: v.snapshot.published_at,
      observed_at: observedAt,
    };
    if (v.kind === "claims") {
      const c = output.claims[v.index];
      if (!c) continue;
      evidence.push({
        ...common,
        company_scope: COMPANY_FIELD_KEYS.includes(c.field_key),
        claim_type: claimTypeForField(c.field_key),
        claim_text: `${c.field_key}: ${c.quote}`.slice(0, 5000),
        claim_value: { field_key: c.field_key, value: c.value, quote: c.quote },
        evidence_type:
          c.field_key === "billing_models" || c.field_key === "pricing_status"
            ? "pricing_evidence"
            : "official_statement",
        fact_status: c.fact_status,
        monetization_signal: null,
      });
    } else if (v.kind === "features" || v.kind === "integrations") {
      const f = output[v.kind][v.index];
      if (!f) continue;
      evidence.push({
        ...common,
        company_scope: false,
        claim_type: v.kind === "features" ? "feature" : "integration",
        claim_text: f.name,
        claim_value: { name: f.name, quote: f.quote },
        evidence_type: "official_statement",
        fact_status: "confirmed",
        monetization_signal: null,
      });
    } else {
      const p = output.pricing_plans[v.index];
      if (!p) continue;
      evidence.push({
        ...common,
        company_scope: false,
        claim_type: "pricing",
        claim_text: `${p.plan_name}: ${p.quote}`.slice(0, 5000),
        claim_value: { ...p },
        evidence_type: "pricing_evidence",
        fact_status: "confirmed",
        // A pricing page proves an offer, never a paying customer.
        monetization_signal: v.monetizationSignal,
      });
    }
  }

  // Field selection: new claims compete with the current selected claim; a new
  // claim can be selected only when verified.
  const product_fields: EnrichmentPlan["product_fields"] = {};
  const company_fields: EnrichmentPlan["company_fields"] = {};
  const conflicts: EnrichmentPlan["conflicts"] = [];
  const fieldsUpdated: string[] = [];
  const byField = new Map<
    string,
    Array<{ candidate: ClaimCandidate; selectable: boolean; factStatus: string; value: unknown }>
  >();
  verified
    .filter((v) => v.kind === "claims" && keyOf.has(v.ref))
    .forEach((v) => {
      const c = output.claims[v.index];
      if (!c) return;
      const list = byField.get(c.field_key) ?? [];
      list.push({
        candidate: {
          fieldKey: c.field_key,
          value: c.value,
          verificationStatus: v.status,
          factStatus: c.fact_status,
          reliabilityLevel: 1,
          observedAt,
          evidenceId: keyOf.get(v.ref) as string,
        },
        selectable: v.status === "verified",
        factStatus: c.fact_status,
        value: c.value,
      });
      byField.set(c.field_key, list);
    });

  for (const [field, news] of byField) {
    const current = existing.find((e) => e.field_key === field);
    const currentCandidate: ClaimCandidate | null = current
      ? {
          fieldKey: field,
          value: current.value,
          verificationStatus: current.verification_status,
          factStatus: current.fact_status,
          reliabilityLevel: current.reliability_level,
          observedAt: current.observed_at,
          evidenceId: current.evidence_id,
        }
      : null;
    const pool = [
      ...(currentCandidate ? [currentCandidate] : []),
      ...news.filter((n) => n.selectable).map((n) => n.candidate),
    ];
    const selected = selectClaim(pool);
    if (selected && isKey(selected.evidenceId)) {
      const entry = news.find((n) => n.candidate.evidenceId === selected.evidenceId);
      const target = COMPANY_FIELD_KEYS.includes(field as EnrichmentFieldKey)
        ? company_fields
        : product_fields;
      if (entry && !(target === company_fields && !product.company_id)) {
        target[field] = {
          value: entry.value,
          evidence_key: selected.evidenceId,
          fact_status: entry.factStatus,
        };
        fieldsUpdated.push(field);
      }
    }
    const all = [
      ...(currentCandidate && current?.value !== undefined && current.value !== null
        ? [currentCandidate]
        : []),
      ...news.map((n) => n.candidate),
    ];
    for (const c of detectConflicts(all)) {
      conflicts.push({
        field_key: c.fieldKey,
        ...(isKey(c.a) ? { a: c.a } : { a_id: c.a }),
        ...(isKey(c.b) ? { b: c.b } : { b_id: c.b }),
      });
    }
  }

  const verifiedOf = (kind: "features" | "integrations" | "pricing_plans") =>
    verified.filter((v) => v.kind === kind && v.status === "verified" && keyOf.has(v.ref));

  const features = verifiedOf("features").flatMap((v) => {
    const f = output.features[v.index];
    return f
      ? [
          {
            name: f.name,
            is_primary: f.is_primary,
            availability: "available" as const,
            evidence_key: keyOf.get(v.ref) as string,
          },
        ]
      : [];
  });
  const integrations = verifiedOf("integrations").flatMap((v) => {
    const f = output.integrations[v.index];
    return f
      ? [
          {
            name: f.name,
            integration_category: f.integration_category,
            availability: "available" as const,
            evidence_key: keyOf.get(v.ref) as string,
          },
        ]
      : [];
  });
  const pricing_plans = verifiedOf("pricing_plans").flatMap((v) => {
    const p = output.pricing_plans[v.index];
    if (!p) return [];
    // The quote and snapshot live on the evidence item, not on the plan row.
    const plan: Record<string, unknown> = { ...p };
    delete plan.quote;
    delete plan.source_snapshot_id;
    return [
      {
        ...plan,
        currency: p.currency?.toUpperCase() ?? null,
        evidence_key: keyOf.get(v.ref) as string,
      },
    ];
  });

  const tagline = (product_fields.tagline?.value as string | undefined) ?? product.tagline;
  const description =
    (product_fields.description?.value as string | undefined) ?? product.description;
  const exclusion = classifyExclusion({
    primaryCategorySlugs: product.primary_category_slugs,
    name: product.name,
    tagline,
    primaryUseCase: output.primary_use_case,
    secondaryTexts: [
      description,
      (product_fields.short_description?.value as string | undefined) ?? product.short_description,
    ].filter((t): t is string => Boolean(t)),
    featureTexts: [
      ...output.features.map((f) => f.name),
      ...output.integrations.map((i) => i.name),
    ],
    llmCorePurposeFlag: output.core_purpose_flag,
  });

  return {
    plan: {
      evidence,
      product_fields,
      company_fields,
      features,
      integrations,
      pricing_plans,
      conflicts,
      exclusion: {
        status: exclusion.status,
        rule_set_version: exclusion.ruleSetVersion,
        matched_rules: exclusion.matchedRules,
        incidental_mentions: exclusion.incidentalMentions,
      },
    },
    fieldsUpdated,
    conflicts: conflicts.length,
  };
}
