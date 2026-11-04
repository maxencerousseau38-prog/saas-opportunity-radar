// French UI labels for catalog enums (the UI is in French, PRD §17).
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
  {
    value: "least_analyzed",
    label: "Les moins analysés",
    disabled: "Disponible avec les analyses (Sprint 5)",
  },
  {
    value: "ai_potential",
    label: "Potentiel IA",
    disabled: "Disponible avec les analyses (Sprint 5)",
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
