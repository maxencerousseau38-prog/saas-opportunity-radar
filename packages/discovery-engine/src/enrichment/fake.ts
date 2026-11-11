// Fake-provider handlers for D5/D6 (tests and local development only;
// ADR-006). They are deterministic text heuristics, not an AI model, and
// say so in their warnings. A real provider is chosen by PD-24.
import {
  ENRICHMENT_FIELD_KEYS,
  type EnrichmentOutput,
  type VerificationOutput,
} from "@sor/contracts";
import { normalizeForMatch } from "@sor/domain";
import type { FakeHandler, ProviderCall } from "@sor/ai-gateway";
import { D5_AGENT_KEY, D6_AGENT_KEY } from "./prompts";

const PRICE =
  /(?:(€|\$|£)\s?(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s?(€|\$|£|(?:eur|usd|gbp)\b))(?:\s*(?:\/|per|par|a|an?)\s*(month|mo|mois|year|yr|an|année|annee|user|utilisateur))?/i;
const CURRENCY: Record<string, string> = {
  "€": "EUR",
  eur: "EUR",
  $: "USD",
  usd: "USD",
  "£": "GBP",
  gbp: "GBP",
};

function heuristicD5(call: ProviderCall): EnrichmentOutput {
  const out: EnrichmentOutput = {
    claims: [],
    features: [],
    integrations: [],
    pricing_plans: [],
    primary_use_case: null,
    core_purpose_flag: "unknown",
    unknown_fields: [],
    warnings: ["fake_provider: deterministic text heuristics, not an AI model"],
  };
  call.request.untrustedInputs.forEach((input, pageIndex) => {
    const lines = input.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (pageIndex === 0) {
      const sentence = lines.find(
        (l) => l.length >= 30 && l.length <= 300 && /[a-zà-ÿ]/.test(l) && !PRICE.test(l),
      );
      if (sentence) {
        out.claims.push({
          field_key: "short_description",
          value: sentence,
          quote: sentence,
          source_snapshot_id: input.ref,
          fact_status: "declared",
        });
      }
    }
    lines.forEach((line, i) => {
      const m = line.length <= 300 ? PRICE.exec(line) : null;
      if (m && out.pricing_plans.length < 15) {
        const amount = Number((m[2] ?? m[3] ?? "").replace(",", "."));
        const currency = CURRENCY[(m[1] ?? m[4] ?? "").toLowerCase()] ?? null;
        const unit = (m[5] ?? "").toLowerCase();
        const period = /^(month|mo|mois)$/.test(unit)
          ? "month"
          : /^(year|yr|an|année|annee)$/.test(unit)
            ? "year"
            : "unknown";
        const before = line
          .slice(0, m.index)
          .replace(/[:\-–—|]+\s*$/, "")
          .trim();
        out.pricing_plans.push({
          plan_name: (before || `Plan ${out.pricing_plans.length + 1}`).slice(0, 60),
          billing_period: period,
          price_amount: Number.isFinite(amount) ? amount : null,
          currency: Number.isFinite(amount) ? currency : null,
          price_per_user: /user|utilisateur/.test(unit) ? true : null,
          has_free_trial: null,
          has_free_plan: amount === 0 ? true : null,
          custom_pricing: null,
          is_entry_plan: out.pricing_plans.length === 0,
          is_enterprise_plan: /enterprise|entreprise/i.test(before),
          quote: line.slice(0, 300),
          source_snapshot_id: input.ref,
        });
      }
      if (/^(features|fonctionnalités|fonctionnalites)$/i.test(line)) {
        for (const f of lines.slice(i + 1, i + 11)) {
          // Feature names are short labels, not sentences (a sentence is page text, possibly instructions).
          const words = f.split(/\s+/).length;
          if (
            f.length < 3 ||
            f.length > 60 ||
            words > 6 ||
            /[.!?]$/.test(f) ||
            PRICE.test(f) ||
            out.features.length >= 40
          )
            break;
          out.features.push({
            name: f,
            is_primary: false,
            quote: f,
            source_snapshot_id: input.ref,
          });
        }
      }
    });
  });
  const claimed = new Set(out.claims.map((c) => c.field_key));
  out.unknown_fields = ENRICHMENT_FIELD_KEYS.filter((k) => !claimed.has(k));
  return out;
}

function heuristicD6(call: ProviderCall): VerificationOutput {
  const pages = new Map(
    call.request.untrustedInputs.map((i) => [i.ref, normalizeForMatch(i.text)]),
  );
  const items = (
    call.request.trustedInput as {
      items: Array<{ ref: string; quote: string; source_snapshot_id: string }>;
    }
  ).items;
  return {
    judgments: items.map((item) => ({
      ref: item.ref,
      support: (pages.get(item.source_snapshot_id) ?? "").includes(normalizeForMatch(item.quote))
        ? "supported"
        : "not_supported",
      note: null,
    })),
  };
}

export const fakeEnrichmentHandlers: Record<string, FakeHandler> = {
  [D5_AGENT_KEY]: heuristicD5,
  [D6_AGENT_KEY]: heuristicD6,
};
