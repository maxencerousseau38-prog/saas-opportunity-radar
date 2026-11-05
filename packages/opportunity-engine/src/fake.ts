// Fake handlers of O1–O9 for tests, development and the CI (ADR-006, PD-08 A).
// Deterministic heuristics over the evidence index, every text prefixed
// "[simulé]": a baseline that exercises the pipeline and the server rules,
// never a market analysis (PD-24a pending). They cite only evidence they
// were given and never fabricate figures.
import type { FakeHandler, ProviderCall } from "@sor/ai-gateway";
import {
  O1_AGENT_KEY,
  O2_AGENT_KEY,
  O3_AGENT_KEY,
  O4_AGENT_KEY,
  O5_AGENT_KEY,
  O6_AGENT_KEY,
  O7_AGENT_KEY,
  O8_AGENT_KEY,
  O9_AGENT_KEY,
} from "./prompts";

const S = "[simulé]";

interface Ev {
  id: string;
  claimType: string;
  product: string;
  reliability: number;
  verification: string;
  wtp: string | null;
  text: string;
}

/** Evidence of the index as the agent sees it (label metadata + untrusted text). */
function evidenceOf(call: ProviderCall): Ev[] {
  return call.request.untrustedInputs.map((u) => {
    const meta = /^evidence \[(.*)\]$/.exec(u.label)?.[1]?.split(" · ") ?? [];
    return {
      id: u.ref,
      claimType: meta[0] ?? "",
      product: meta[1] ?? "",
      reliability: Number(/reliability (\d)/.exec(u.label)?.[1] ?? 4),
      verification: meta[3] ?? "unverified",
      wtp: /wtp:([a-z_]+)/.exec(u.label)?.[1] ?? null,
      text: u.text,
    };
  });
}
const sup = (e: Ev) => ({ evidence_id: e.id, support_type: "supports" as const });
const fact = (text: string, e: Ev) => ({
  text: `${S} ${text}`,
  is_hypothesis: false,
  evidence: [sup(e)],
});
const hyp = (text: string) => ({ text: `${S} ${text}`, is_hypothesis: true, evidence: [] });
const pains = (ev: Ev[]) =>
  ev.filter((e) => ["customer_feedback", "customer_pain"].includes(e.claimType));
const trusted = (call: ProviderCall) => call.request.trustedInput as Record<string, unknown>;
const subjectName = (call: ProviderCall) => {
  const subject = trusted(call).subject as { scope: Array<{ name: string; role: string }> };
  return subject.scope.find((p) => p.role !== "competitor")?.name ?? "le sujet";
};
/** A verified, reliable statement that the product is discontinued (kill criterion). */
const discontinued = (ev: Ev[]) =>
  ev.find(
    (e) =>
      /\b(discontinued|shut(ting)? down|end of life|sunset)\b/i.test(e.text) &&
      e.verification === "verified" &&
      e.reliability <= 3,
  );

const productAnalyst: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const desc = ev.find((e) => e.claimType === "product_description");
  const pricing = ev.find((e) => e.claimType === "pricing");
  return {
    positioning: desc ? fact(desc.text.slice(0, 300), desc) : null,
    target_customer: null,
    core_jtbd: hyp(`Tâche principale de ${subjectName(call)} non établie par les preuves.`),
    features_observed: ev
      .filter((e) => e.claimType === "feature")
      .slice(0, 10)
      .map((e) => ({ name: `${S} ${e.text.slice(0, 150)}`, evidence: [sup(e)] })),
    features_not_observed: [],
    pricing_model: pricing ? fact(pricing.text.slice(0, 300), pricing) : null,
    integrations: ev
      .filter((e) => e.claimType === "integration")
      .slice(0, 10)
      .map((e) => ({ name: `${S} ${e.text.slice(0, 150)}`, evidence: [sup(e)] })),
    limitations: [],
    evidence_gaps: [
      ...(pricing ? [] : ["Pas de preuve de tarification"]),
      ...(desc ? [] : ["Pas de description sourcée"]),
    ],
  };
};

const marketAnalyst: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const trends = ev.filter((e) => e.claimType === "market_trend");
  return {
    market_definition: hyp(`Marché défini à partir du périmètre de ${subjectName(call)}.`),
    segments: [],
    demand_signals: pains(ev)
      .slice(0, 3)
      .map((e) => fact(`Signal de demande : ${e.text.slice(0, 200)}`, e)),
    spend_signals: [],
    trends: trends.slice(0, 3).map((e) => ({
      statement: `${S} ${e.text.slice(0, 300)}`,
      as_of: "2026",
      is_hypothesis: false,
      evidence: [sup(e)],
    })),
    competitive_intensity: { level: "unknown", explanation: null },
    market_size: {
      status: "insufficient_data",
      reason: `${S} Aucune donnée de taille de marché sourcée avec méthodologie.`,
    },
  };
};

const customerVoice: FakeHandler = (call) => {
  const clusters = trusted(call).clusters as Array<{
    cluster_id: string;
    name: string;
    feedback_count: number;
    evidence_ids: string[];
  }>;
  return {
    top_problems: clusters
      .filter((c) => c.evidence_ids.length > 0)
      .slice(0, 5)
      .map((c) => ({
        cluster_id: c.cluster_id,
        summary: `${S} ${c.name}`,
        examples: c.evidence_ids
          .slice(0, 3)
          .map((id) => ({ evidence_id: id, support_type: "supports" })),
      })),
    relevant_source_count: 0, // replaced by the deterministic statistics
    distinct_author_count: null,
    sample_limitations: [`${S} Échantillon d’avis auto-sélectionné, non représentatif.`],
  };
};

const competitorAnalyst: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const known = trusted(call).known_competitors as Array<{
    product_id: string;
    name: string;
    website_url: string | null;
  }>;
  return {
    competitors: known.slice(0, 20).map((c) => {
      const own = ev.filter((e) => e.product === c.name).slice(0, 3);
      return {
        product_id: c.product_id,
        name: c.name,
        website_url: c.website_url,
        relationship_type: "indirect", // never "direct" without a demonstrated comparable buyer
        segment_facets: [],
        positioning: own[0] ? fact(own[0].text.slice(0, 200), own[0]) : null,
        target_segment: null,
        pricing_evidence: null,
        feature_overlap: null,
        differentiators: [],
        weaknesses: [],
        evidence: own.map(sup),
        confidence: own.length > 0 ? 40 : 20,
      };
    }),
    omitted_excluded_count: 0,
  };
};

const localization: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const fr = ev.find((e) => e.claimType === "language" && /\b(fr|french|français)\b/i.test(e.text));
  return {
    french_availability: fr
      ? { status: "available", evidence: [sup(fr)] }
      : { status: "not_observed", evidence: [] },
    french_competitors: [],
    local_needs: [],
    local_integrations: [],
    language_support_expectations: null,
    regulatory_notes: [],
    pricing_distribution_notes: null,
    unmet_need_beyond_translation: {
      exists: null,
      explanation: `${S} Aucun besoin local au-delà de la traduction n’est démontré par les preuves.`,
      evidence: [],
    },
  };
};

const wtpFeasibility: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const byCategory = new Map<string, Ev[]>();
  for (const e of ev) if (e.wtp) byCategory.set(e.wtp, [...(byCategory.get(e.wtp) ?? []), e]);
  const item = {
    level: "unknown",
    explanation: `${S} Non évalué par le fournisseur simulé.`,
    evidence: [],
  };
  return {
    wtp_evidence: [...byCategory.entries()].map(([category, items]) => ({
      category,
      evidence: items.slice(0, 10).map(sup),
    })),
    feasibility: {
      technical_complexity: item,
      dependencies: item,
      build_effort: item,
      operating_cost: item,
      data_access_risk: item,
      distribution_access: item,
      switching_cost: item,
      support_burden: item,
    },
    assumptions: [`${S} Évaluation simulée : aucune hypothèse de marché réelle.`],
    uncertainty: { level: "high", note: `${S} Fournisseur simulé.` },
  };
};

const missing = (key: string, what: string) => ({
  dimension_key: key,
  assessment_status: "insufficient_evidence",
  explanation: `${S} Preuves insuffisantes.`,
  evidence: [],
  missing_information: [what],
});
const assessed = (key: string, rating: number, items: Ev[], why: string) => ({
  dimension_key: key,
  assessment_status: "assessed",
  rating,
  explanation: `${S} ${why}`,
  evidence: items.slice(0, 10).map(sup),
  missing_information: [],
});

const dimensionAssessor: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const pain = pains(ev);
  const paying = ev.filter((e) => e.wtp === "payment_confirmed" || e.wtp === "customer_verified");
  const paidPlan = ev.filter((e) => e.wtp === "paid_plan_available" || e.claimType === "pricing");
  const market = ev.filter((e) => ["market_size", "market_trend"].includes(e.claimType));
  const competitorEvidence = (
    (
      trusted(call).competitor_analysis as {
        competitors?: Array<{ evidence: Array<{ evidence_id: string }> }>;
      } | null
    )?.competitors ?? []
  ).flatMap((c) => c.evidence.map((e) => e.evidence_id));
  const differentiation = ev.filter((e) => competitorEvidence.includes(e.id));
  const build = ev.filter((e) => ["feature", "integration"].includes(e.claimType));
  return {
    proposals: [
      pain.length >= 2
        ? assessed(
            "customer_demand",
            pain.length >= 5 ? 4 : 3,
            pain,
            "Plaintes récurrentes dans l’échantillon.",
          )
        : missing("customer_demand", "Retours clients récurrents"),
      paying.length > 0
        ? assessed(
            "willingness_to_pay",
            4,
            paying,
            "Signal de paiement présent (plafonné par le serveur s’il n’est pas vérifié).",
          )
        : paidPlan.length > 0
          ? assessed(
              "willingness_to_pay",
              2,
              paidPlan,
              "Une offre payante existe ; cela ne prouve pas des clients payants.",
            )
          : missing("willingness_to_pay", "Preuve de clients payants"),
      pain.length >= 2
        ? assessed("product_gap", 3, pain, "Faiblesse récurrente observée.")
        : missing("product_gap", "Faiblesses produit sourcées"),
      market.length > 0
        ? assessed("market_attractiveness", 3, market, "Données de marché sourcées.")
        : missing("market_attractiveness", "Données de marché sourcées"),
      differentiation.length > 0
        ? assessed(
            "competitive_differentiation",
            2,
            differentiation,
            "Concurrents identifiés ; différenciation non démontrée.",
          )
        : missing("competitive_differentiation", "Analyse concurrentielle sourcée"),
      build.length > 0
        ? assessed(
            "feasibility_distribution",
            3,
            build,
            "Fonctionnalités observables reproductibles.",
          )
        : missing("feasibility_distribution", "Preuves de faisabilité et de distribution"),
    ],
    findings: [
      ...(pain[0]
        ? [
            {
              type: "pain_point",
              title: `${S} ${pain[0].text.slice(0, 150)}`,
              description: `${S} Problème client observé dans l’échantillon.`,
              priority: 2,
              confidence: 40,
              is_hypothesis: false,
              severity: null,
              dimension_key: "customer_demand",
              evidence: [sup(pain[0])],
            },
          ]
        : []),
      {
        type: "opportunity",
        title: `${S} Alternative plus fiable à ${subjectName(call)}`,
        description: `${S} Hypothèse à valider : résoudre le problème principal observé.`,
        priority: 3,
        confidence: 20,
        is_hypothesis: true,
        severity: null,
        dimension_key: "product_gap",
        evidence: [],
      },
    ],
  };
};

const redTeam: FakeHandler = (call) => {
  const ev = evidenceOf(call);
  const fatal = discontinued(ev);
  const paying = ev.some(
    (e) =>
      (e.wtp === "payment_confirmed" || e.wtp === "customer_verified") &&
      e.verification === "verified",
  );
  return {
    strongest_counterarguments: [
      {
        argument: `${S} Les clients peuvent déjà être satisfaits des alternatives existantes.`,
        evidence: [],
      },
    ],
    kill_criteria: [
      ...(fatal
        ? [
            {
              criterion: `${S} Produit arrêté selon une source vérifiée`,
              severity: "critical",
              explanation: `${S} ${fatal.text.slice(0, 300)}`,
              evidence: [sup(fatal)],
            },
          ]
        : []),
      ...(paying
        ? []
        : [
            {
              criterion: `${S} Aucun client payant vérifié`,
              severity: "major",
              explanation: `${S} Une offre payante ne prouve pas que des clients paient.`,
              evidence: [],
            },
          ]),
    ],
    unresolved_assumptions: [`${S} La douleur observée est représentative.`],
    recommended_verdict: fatal ? "reject" : "validate_first",
    confidence: 30,
  };
};

const reportComposer: FakeHandler = (call) => {
  const t = trusted(call);
  const name = subjectName(call);
  const verdict = String(t.verdict);
  const voice = t.customer_voice as { top_problems?: Array<{ summary: string }> } | null;
  const problem = voice?.top_problems?.[0]?.summary ?? null;
  return {
    executive_summary: {
      description: hyp(`Analyse simulée de ${name}.`),
      main_reasons: [hyp(`Verdict serveur : ${verdict} ; preuves de démonstration uniquement.`)],
    },
    market_analysis: { market: [], target: [], demand: [], trends: [], competition: [] },
    customer_pain: { narrative: problem ? [hyp(`Problème principal observé : ${problem}`)] : [] },
    cross_competitor_pain: { narrative: [] },
    market_gaps: {
      common_problems: [],
      unmet_needs: [],
      missing_features: [],
      insufficient_solutions: [],
      independent_opportunities: [],
      failure_reasons: [hyp("La demande pourrait ne pas se traduire en achats.")],
    },
    competitor_analysis: { narrative: [] },
    opportunity_map: problem
      ? [
          {
            priority: 1,
            problem: `${S} ${problem}`.slice(0, 500),
            customer_segment: `${S} Utilisateurs actuels du périmètre`,
            proposed_solution: `${S} Outil ciblé qui résout ce problème`,
            competitive_advantage: `${S} À démontrer`,
            development_difficulty: "unknown",
            commercial_potential: "unknown",
            is_hypothesis: true,
            evidence: [],
          },
        ]
      : [],
    recommended_product: {
      name: `${S} Alternative ciblée à ${name}`.slice(0, 200),
      value_proposition: `${S} Résoudre le problème principal observé`,
      initial_target: `${S} Petites équipes B2B`,
      positioning: `${S} Plus fiable sur le problème observé`,
      mvp_features: [`${S} Fonction qui corrige le problème principal`],
      secondary_features: [],
      pricing_hypothesis: `${S} À tester`,
      main_advantage: `${S} À démontrer`,
      is_hypothesis: true,
      evidence: [],
    },
    go_to_market: {
      acquisition_channel: null,
      first_audience: null,
      prospecting_method: null,
      launch_strategy: null,
      validation_effort: hyp("Quelques entretiens avant tout développement."),
    },
    validation_plan: t.generate_validation_plan
      ? [
          {
            type: "user_interviews",
            description: `${S} 10 entretiens avec des utilisateurs du périmètre`,
            success_threshold: `${S} 6 sur 10 confirment le problème et un budget`,
            abandon_threshold: `${S} Moins de 3 sur 10`,
            estimated_effort: `${S} 2 semaines`,
          },
        ]
      : [],
    risks: {
      reasons_not_to_build: [hyp("Aucune preuve vérifiée de clients payants.")],
      technical: [],
      commercial: [],
      competitive: [],
      regulatory: [],
      unverified_information: [`${S} Résultats produits par un fournisseur simulé`],
    },
    final_verdict_explanation: [hyp(`Le serveur applique les règles de verdict : ${verdict}.`)],
  };
};

export const fakeOpportunityHandlers: Record<string, FakeHandler> = {
  [O1_AGENT_KEY]: productAnalyst,
  [O2_AGENT_KEY]: marketAnalyst,
  [O3_AGENT_KEY]: customerVoice,
  [O4_AGENT_KEY]: competitorAnalyst,
  [O5_AGENT_KEY]: localization,
  [O6_AGENT_KEY]: wtpFeasibility,
  [O7_AGENT_KEY]: dimensionAssessor,
  [O8_AGENT_KEY]: redTeam,
  [O9_AGENT_KEY]: reportComposer,
};
