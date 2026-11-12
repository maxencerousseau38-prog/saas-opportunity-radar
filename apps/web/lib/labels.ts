// French UI labels for catalog enums (the UI is in French, PRD §17).
import { ACQUISITION_CHANNELS } from "@sor/domain/channels";
export const CUSTOMER_TYPE: Record<string, string> = {
  b2b: "B2B",
  b2c: "B2C",
  b2b_b2c: "B2B et B2C",
  unknown: "Clientèle inconnue",
};

export const PRICING_STATUS: Record<string, string> = {
  free: "Gratuit",
  paid: "Payant",
  freemium: "Freemium",
  custom: "Sur devis",
  unknown: "Tarification inconnue",
};

export const BILLING_MODEL: Record<string, string> = {
  monthly_subscription: "Abonnement mensuel",
  annual_subscription: "Abonnement annuel",
  freemium: "Freemium",
  free_trial: "Essai gratuit",
  usage_based: "À l'usage",
  per_user: "Par utilisateur",
  volume_based: "Au volume",
  license: "Licence",
  other: "Autre",
};

export const SORTS: Array<{ value: string; label: string; disabled?: string }> = [
  { value: "relevance", label: "Plus pertinents" },
  { value: "newest", label: "Plus récents" },
  { value: "recently_added", label: "Récemment ajoutés" },
  { value: "best_monetization_evidence", label: "Meilleures preuves de monétisation" },
  { value: "smallest_team", label: "Plus petites équipes" },
  { value: "oldest", label: "Plus anciens" },
  { value: "most_recent_activity", label: "Plus forte activité récente" },
  { value: "random", label: "Ordre aléatoire" },
  { value: "least_analyzed", label: "Les moins analysés" },
  {
    value: "ai_potential",
    label: "Potentiel IA",
    disabled: "Indisponible : les scores d’analyse sont simulés tant que PD-24 n’est pas décidé",
  },
];

export const TEAM_PRESETS = ["1-5", "1-10", "1-20", "20-50", "50-100", "100+"] as const;
export const AGE_BUCKETS: Record<string, string> = {
  lt_1: "Moins d'un an",
  "1_2": "1 à 2 ans",
  "2_5": "3 à 5 ans",
  "5_10": "6 à 10 ans",
  gt_10: "Plus de 10 ans",
};
export const PRICE_BANDS: Record<string, string> = {
  free: "Gratuit",
  lt_10: "Moins de 10 €/mois",
  "10_30": "10 à 30 €/mois",
  "30_100": "30 à 100 €/mois",
  "100_500": "100 à 500 €/mois",
  gt_500: "Plus de 500 €/mois",
  custom: "Sur devis",
};
export const COMMERCIAL_VALIDATION: Record<string, string> = {
  paying_customers_confirmed: "Clients payants confirmés",
  customer_reviews: "Avis clients",
  testimonials: "Témoignages",
  case_studies: "Études de cas",
  paid_subscriptions: "Offre payante publiée (ne prouve pas de clients)",
  traction_signals: "Signaux de traction",
  monetization_unverified: "Monétisation non vérifiée",
  insufficient_data: "Données insuffisantes",
};
export const COMPANY_PROFILE: Record<string, string> = {
  founder_led: "Dirigée par son fondateur",
  indie_saas: "Indie SaaS",
  small_team: "Petite équipe (≤ 20)",
  independent: "Indépendante",
  funded: "Financée",
  bootstrapped: "Autofinancée",
  subsidiary_or_group: "Filiale ou groupe",
  unknown: "Profil inconnu",
};
/** Labels of the canonical channel registry (@sor/domain chanreg-1, ADR-017). */
export const ACQUISITION_CHANNEL: Record<string, string> = Object.fromEntries(
  ACQUISITION_CHANNELS.map((c) => [c.key, c.label]),
);
export const ACQUISITION_CHANNEL_CATEGORY: Record<string, string> = {
  organic: "Organique",
  community: "Communauté",
  content_search: "Contenu et recherche",
  social: "Réseaux sociaux",
  partnership: "Partenariats",
  paid: "Acquisition payante",
  other: "Autre",
  unknown: "Inconnu",
};
export const VISUAL_ASSET_TYPE: Record<string, string> = {
  official_hero: "Visuel officiel",
  product_screenshot: "Capture authentique du produit",
  official_illustration: "Illustration officielle",
  // PD-38: displayed by reference.
  licensed_image: "Image sous licence libre",
  publisher_share_image: "Image de partage publiée par l’éditeur",
};
/** Why a reference is shown, stated next to it (PD-38). */
export const VISUAL_RIGHTS_NOTE: Record<string, string> = {
  licensed:
    "Image sous licence libre hébergée sur Wikimedia Commons, affichée depuis son origine avec son auteur et sa licence.",
  publisher_published:
    "Image déclarée par l’éditeur sur son site officiel pour les aperçus de liens : affichée depuis son origine, sans licence vérifiée.",
};
/** "CC-BY-SA-4.0" -> "CC BY-SA 4.0"; "CC0-1.0" -> "CC0"; "Public-Domain" -> "Domaine public". */
export function licenceLabel(code: string | null): string | null {
  if (!code) return null;
  if (code === "Public-Domain") return "Domaine public";
  if (code === "CC0-1.0") return "CC0";
  const m = /^CC-BY(-SA)?-(\d\.\d)$/.exec(code);
  return m ? `CC BY${m[1] ? "-SA" : ""} ${m[2]}` : code;
}
export const ACQUISITION_CHANNEL_STATUS: Record<string, string> = {
  confirmed: "Confirmé",
  declared: "Déclaré",
  estimated: "Estimé",
  unknown: "Inconnu",
};
/** Why a collected catalog listing was sent to review (S8.2, ingestion rules). */
export const CATALOG_REVIEW_REASON: Record<string, string> = {
  shared_host_website:
    "Site sur un hébergeur partagé (app store, hébergeur de code, réseau social) : pas un site officiel",
  same_domain_other_url: "Même domaine qu’un produit existant, avec une autre URL",
  similar_name: "Nom proche d’un produit existant",
  same_name_same_company: "Même nom qu’un produit de la même entreprise",
  domain_maps_to_several_products: "Domaine déjà partagé par plusieurs produits",
  invalid_official_url: "URL officielle invalide",
  missing_official_url: "URL officielle absente",
};
/** Confidence of a sourced fact: a percentage only when it is known. */
export function confidenceLabel(confidence: number | null | undefined): string {
  return typeof confidence === "number" && Number.isFinite(confidence)
    ? `confiance ${confidence}%`
    : "confiance inconnue";
}
export const CONFIGURABLE_EXCLUSIONS: Record<string, string> = {
  b2c_only: "SaaS uniquement B2C",
  groups_and_large_companies: "Grands groupes et entreprises > 100 personnes",
  free_without_monetization: "Produits gratuits sans monétisation",
  no_identifiable_activity: "Sans activité identifiable",
  too_recent_without_demand_proof: "Trop récents sans preuve de demande",
  very_technical_devtools: "Outils très techniques (Developer Tools)",
  already_analyzed_and_rejected: "Déjà analysés et rejetés",
};
export const OPPORTUNITY_STATUS: Record<string, string> = {
  discovered: "Découvert",
  to_research: "À étudier",
  analyzing: "En analyse",
  validate: "À valider",
  validated: "Validé",
  rejected: "Rejeté",
  building: "En construction",
};
export const FACT_STATUS: Record<string, string> = {
  confirmed: "Confirmé",
  estimated: "Estimé",
  declared: "Déclaré",
  unknown: "Inconnu",
};
export const RELIABILITY: Record<number, string> = {
  1: "Niveau 1 — preuve primaire",
  2: "Niveau 2 — source spécialisée",
  3: "Niveau 3 — source communautaire",
  4: "Niveau 4 — estimation, inférence ou déclaration",
};
export const RELATIONSHIP: Record<string, string> = {
  direct: "Concurrent direct",
  indirect: "Concurrent indirect",
  alternative: "Alternative",
  substitute: "Substitut",
  adjacent: "Produit adjacent",
};
export const AVAILABILITY: Record<string, string> = {
  available: "Disponible",
  beta: "Bêta",
  planned: "Prévu",
  removed: "Retiré",
  not_observed: "Non observé",
  unknown: "Inconnu",
};
export const ROLE: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};
export const REPORT_TYPE: Record<string, string> = {
  wrong_category: "Mauvaise catégorie",
  incorrect_information: "Information incorrecte",
  suspected_excluded_category: "Catégorie exclue (affiliation / partenariat)",
  duplicate: "Doublon",
  other: "Autre",
};
export const SIGNAL_TYPE: Record<string, string> = {
  review_count: "Nombre d'avis",
  review_rating: "Note sur une plateforme d'avis",
  testimonial: "Témoignage",
  case_study: "Étude de cas",
  customer_logo: "Logo client publié",
  commercial_reference: "Référence commerciale",
  product_hunt_presence: "Présence sur Product Hunt",
  founder_activity: "Activité du fondateur",
  headcount_change: "Évolution des effectifs",
  launch_or_update: "Lancement ou mise à jour",
  traffic_estimate: "Estimation de trafic (estimation, pas une mesure)",
  funding_announcement: "Annonce de financement",
  commercial_activity: "Activité commerciale",
};

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function teamLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return min === max ? `${min} pers.` : `${min}–${max} pers.`;
  return max !== null ? `≤ ${max} pers.` : `≥ ${min} pers.`;
}

/** Reserved test/demo domains (RFC 2606): such records are demo fixtures. */
export function isDemoUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return /\.(test|example|invalid)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

/** Date and time in UTC (stable between server and browser rendering). */
export function formatDateTime(iso: string): string {
  return `${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

export function formatMoney(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export const JOB_STATE: Record<string, string> = {
  queued: "En file d’attente",
  running: "En cours",
  retrying: "Nouvelle tentative prévue",
  completed: "Terminé",
  partial: "Terminé partiellement",
  failed: "Échec",
  cancelled: "Annulé",
  dead_letter: "Abandonné après plusieurs tentatives",
};

export const TERMINAL_STATES = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
  "dead_letter",
]);

export const IMPORT_ROW_STATUS: Record<string, string> = {
  created: "Créé",
  created_needs_review: "Créé, en revue (affiliation ou partenariat possible)",
  created_excluded: "Créé mais exclu (affiliation ou partenariat)",
  matched_existing: "Déjà au catalogue (rapproché)",
  needs_review: "À vérifier (doublon possible)",
  rejected: "Rejeté",
  duplicate: "Doublon ignoré",
};

// ---------------------------------------------------------------- Pain Point Intelligence (Sprint 4)
export const RUN_STATUS: Record<string, string> = {
  queued: "En file d’attente",
  running: "En cours",
  completed: "Terminée",
  partial: "Terminée partiellement",
  failed: "Échec",
  cancelled: "Annulée",
  needs_review: "À vérifier",
};
export const RUN_TERMINAL = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
  "needs_review",
]);

export const PROBLEM_CATEGORY: Record<string, string> = {
  pricing: "Prix",
  ux: "Ergonomie",
  missing_features: "Fonctionnalités manquantes",
  bugs: "Bugs",
  support: "Support",
  integrations: "Intégrations",
  performance: "Performance",
  documentation: "Documentation",
  customization: "Personnalisation",
  complexity: "Complexité",
  reliability: "Fiabilité",
  other: "Autre",
};

export const FREQUENCY_LABEL: Record<string, string> = {
  isolated: "Isolé",
  recurring: "Récurrent",
  widespread: "Répandu",
  unknown: "Récurrence inconnue",
};

/** How a distinct count was established (Implementation Blueprint §7.3). */
export const COUNT_STATUS: Record<string, string> = {
  verified: "vérifié",
  estimated: "estimation basse",
  unknown: "inconnu",
};

export const CLUSTER_REVIEW: Record<string, string> = {
  machine_proposed: "Proposé automatiquement",
  user_confirmed: "Confirmé",
  user_corrected: "Corrigé",
  rejected: "Rejeté",
};

export const RESOLUTION: Record<string, string> = {
  resolved: "Résolu",
  unresolved: "Non résolu",
  unknown: "Inconnu",
};

export const GAP_TYPE: Record<string, string> = {
  shared_problem: "Problème partagé",
  requested_feature: "Fonctionnalité réclamée",
  manual_workflow: "Workflow manuel",
  user_workaround: "Contournement utilisateur",
  switching_driver: "Motif de changement",
  unsatisfied_need: "Besoin insatisfait",
};

export const SAMPLE_LIMITATION: Record<string, string> = {
  review_sample_not_representative:
    "Un échantillon d’avis n’est pas représentatif de tous les clients.",
  complaints_are_not_willingness_to_pay:
    "Des plaintes ne prouvent pas que des clients paieraient pour une solution.",
  absence_of_observed_solution_is_not_absence_of_competition:
    "Ne pas observer de solution ne prouve pas l’absence de concurrence.",
};

export const RUN_LIMITATION: Record<string, string> = {
  review_sample_not_representative:
    "L’échantillon d’avis n’est pas représentatif de tous les clients.",
  feedback_without_stored_text: "Avis sans texte conservé (droits de stockage) : non analysés.",
  feedback_cap_reached: "Nombre maximal d’avis atteint : les plus récents ont été retenus.",
  feedback_not_extracted: "Certains avis n’ont pas pu être analysés.",
  products_no_longer_visible: "Des produits du périmètre ne sont plus visibles et ont été ignorés.",
  scope_truncated: "Catégorie trop large : périmètre limité aux premiers produits.",
  ai_budget_exhausted: "Budget IA épuisé : résultats partiels.",
  stopped_cancelled: "Analyse annulée.",
  stopped_budget: "Durée maximale atteinte : résultats partiels.",
};

export const EXCLUSION_STATUS: Record<string, string> = {
  eligible: "Éligible",
  needs_review: "En revue (affiliation ou partenariat possible)",
};

// ------------------------------------------------------------ Opportunity analyses (Sprint 5)
export const VERDICT: Record<string, string> = {
  build_candidate: "BUILD CANDIDATE",
  validate_first: "VALIDATE FIRST",
  reject: "REJECT",
};

/** PRD §8.8 decision bands. */
export const DECISION_BAND: Record<string, string> = {
  reject: "Rejeter",
  low_potential: "Faible potentiel",
  to_investigate: "À approfondir",
  interesting: "Intéressant",
  priority: "Prioritaire",
};

export const CONFIDENCE_LEVEL: Record<string, string> = {
  low: "faible",
  medium: "moyenne",
  high: "élevée",
};

/** §9.7 display levels: low < 40, medium 40–69, high ≥ 70. */
export function confidenceLevelOf(value: number): string {
  return value < 40 ? "low" : value < 70 ? "medium" : "high";
}

export const DIMENSION: Record<string, string> = {
  customer_demand: "Demande réelle et problèmes clients",
  willingness_to_pay: "Volonté de payer",
  product_gap: "Faiblesses et amélioration",
  market_attractiveness: "Attractivité du marché",
  competitive_differentiation: "Concurrence et différenciation",
  feasibility_distribution: "Faisabilité et distribution",
};

export const ANALYSIS_SUBJECT: Record<string, string> = {
  product: "SaaS",
  product_set: "Ensemble de SaaS",
  category: "Catégorie",
  pain_point_cluster: "Cluster de problèmes",
  generated_opportunity: "Hypothèse d’opportunité",
};

export const ANALYSIS_STAGE: Record<string, string> = {
  building_evidence_index: "index des preuves",
  product_research: "analyse produit",
  market_research: "analyse du marché",
  customer_voice: "voix des clients",
  competitor_research: "concurrence",
  localization: "marché cible",
  feasibility_wtp: "volonté de payer et faisabilité",
  dimension_assessment: "évaluation des dimensions",
  red_team: "contre-analyse",
  report: "rapport",
};

/** §9.6 reason codes. */
export const VERDICT_REASON: Record<string, string> = {
  FATAL_FLAW: "Critère d’arrêt critique étayé",
  INCOMPLETE_COVERAGE: "Couverture incomplète : score final impossible",
  SCORE_BELOW_REJECT_THRESHOLD: "Score inférieur à 50",
  LOW_POTENTIAL: "Score entre 50 et 64 (faible potentiel)",
  TO_INVESTIGATE: "Score entre 65 et 74 (à approfondir)",
  SCORE_BELOW_BUILD_THRESHOLD: "Score sous le seuil BUILD de l’espace",
  WTP_BELOW_THRESHOLD: "Volonté de payer sous le seuil",
  NO_PAYING_CUSTOMER_EVIDENCE: "Aucune preuve vérifiée de clients payants",
  LOW_CONFIDENCE: "Confiance inférieure à 70",
  INSUFFICIENT_DEMAND_EVIDENCE: "Preuves de demande insuffisantes",
  NO_CONCRETE_DIFFERENTIATION: "Différenciation non démontrée",
  UNRESOLVED_CRITICAL_KILL_CRITERION: "Critère d’arrêt critique non résolu",
  EXCLUDED_RECOMMENDATION: "Produit recommandé exclu ou en revue",
  ALL_GATES_PASSED: "Toutes les conditions BUILD sont remplies",
  RED_TEAM_OBJECTION: "Objection de la contre-analyse",
};

export const ANALYSIS_LIMITATION: Record<string, string> = {
  simulated_provider:
    "Fournisseur IA simulé : contenu de démonstration produit par des règles fixes, pas un résultat réel.",
  products_no_longer_visible: "Des produits du périmètre ne sont plus visibles et ont été ignorés.",
  no_evidence_in_scope: "Aucune preuve disponible dans le périmètre.",
  evidence_index_capped: "Trop de preuves : l’index retient les plus fiables et les plus récentes.",
  customer_reviews_not_analysed: "Avis clients non analysés (option désactivée).",
  competitors_not_analysed: "Concurrence non analysée (option désactivée).",
  local_market_not_analysed: "Marché cible non analysé (option désactivée).",
  review_sample_not_representative:
    "L’échantillon d’avis n’est pas représentatif de tous les clients.",
  pain_point_run_reused: "Voix des clients : analyse de problèmes existante réutilisée.",
  pain_point_run_created: "Voix des clients : analyse de problèmes lancée pour ce périmètre.",
  agent_output_rejected: "Une étape a produit un résultat invalide et a été ignorée.",
  ai_budget_exhausted: "Budget IA épuisé : résultats partiels.",
  red_team_unavailable: "Contre-analyse indisponible : le verdict ne peut pas être BUILD.",
  report_narrative_unavailable:
    "Rédaction du rapport indisponible : seuls les blocs calculés sont affichés.",
  excluded_items_removed: "Éléments relevant de l’exclusion permanente retirés.",
  recommended_product_excluded:
    "Le produit recommandé relève de l’exclusion permanente : section retirée.",
  dimension_assessment_needs_review:
    "Évaluation des dimensions rejetée deux fois : vérification manuelle requise.",
  budget_exhausted_before_scoring: "Budget épuisé avant le calcul du score.",
};

export const FINDING_TYPE: Record<string, string> = {
  pain_point: "Problème client",
  opportunity: "Opportunité",
  risk: "Risque",
  competitor_gap: "Lacune concurrente",
  recommendation: "Recommandation",
  kill_criterion: "Critère d’arrêt",
};

export const SEVERITY: Record<string, string> = {
  critical: "critique",
  major: "majeur",
  minor: "mineur",
};

// ------------------------------------------------------------ AI Discovery (Sprint 6)
export const DISCOVERY_STAGE: Record<string, string> = {
  planning: "interprétation de la demande",
  searching: "recherche dans les sources",
  extracting: "lecture des sites officiels",
  resolving_identity: "identification et dédoublonnage",
  enriching: "enrichissement",
  verifying: "vérification",
  classifying_exclusion: "exclusions permanentes",
  filtering: "filtres",
  ranking: "classement",
  persisting: "enregistrement",
};
export const DISCOVERY_CHANNEL: Record<string, string> = {
  search: "Recherche",
  official_site_rebound: "Rebond depuis les sites officiels",
  seed_url: "URL fournies",
};
export const SOURCE_REPORT_STATUS: Record<string, string> = {
  consulted: "Consultée",
  not_enabled: "Non activée",
  not_supported: "Non prise en charge",
  unavailable: "Indisponible",
  rate_limited: "Limite de débit atteinte",
  error: "Erreur",
  budget_exhausted: "Budget atteint",
};
export const DISCOVERY_LIMITATION: Record<string, string> = {
  excluded_theme_in_prompt:
    "La demande vise un thème exclu en permanence (affiliation / partenariat) : il a été ignoré",
  query_dropped_excluded_theme: "Requête retirée : thème exclu en permanence",
  category_dropped_excluded: "Catégorie exclue en permanence retirée",
  source_not_available: "Source non disponible pour cette recherche",
  source_not_enabled: "Source non activée (revue des conditions en cours)",
  query_budget_reached: "Nombre maximal de requêtes atteint",
  inferred_filter_not_supported: "Filtre déduit pas encore disponible, ignoré",
  lead_budget_reached: "Nombre maximal de pistes atteint",
  extraction_budget_reached: "Nombre maximal de sites lus atteint",
  no_rebound_seed: "Aucun SaaS du catalogue pour le rebond dans ces catégories",
  no_lead: "Aucune piste trouvée",
  injection_suspected: "Instructions suspectes dans une page (traitées comme des données)",
};
export const CANDIDATE_REVIEW: Record<string, string> = {
  pending: "À examiner",
  accepted: "Accepté (ajouté à Discover)",
  rejected: "Écarté",
  needs_review: "À vérifier",
};
export const IDENTITY_DECISION: Record<string, string> = {
  new: "Nouveau SaaS",
  matched_existing: "Déjà dans le catalogue",
  needs_review: "Identité à vérifier",
};
export function rejectionLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "permanent_exclusion") return "Exclusion permanente (affiliation / partenariat)";
  if (reason === "beyond_max_results") return "Au-delà du nombre de résultats demandé";
  if (reason === "user_rejected") return "Écarté par un membre";
  return reason
    .split(",")
    .map((r) =>
      r.startsWith("filter_mismatch:")
        ? `Ne respecte pas le filtre « ${r.slice(16)} »`
        : r.startsWith("configurable_exclusion:")
          ? `Exclusion choisie : ${CONFIGURABLE_EXCLUSIONS[r.slice(23)] ?? r.slice(23)}`
          : r,
    )
    .join(" ; ");
}
