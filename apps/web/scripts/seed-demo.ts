// Demo fixtures for local development and the E2E suite (labelled data:
// every URL uses the reserved `.test` TLD and the UI shows a "donnée de
// démonstration" badge). Refuses to run against a non-local Supabase URL.
//
// Usage (local stack running):
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… \
//   SUPABASE_SECRET_KEY=… SEED_PASSWORD=… node scripts/seed-demo.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const password = process.env.SEED_PASSWORD ?? "";

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error("seed-demo only runs against a local Supabase stack (http://127.0.0.1)");
}
if (!publishableKey || !secretKey || password.length < 12) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY or SEED_PASSWORD (12+ chars)",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, noSession);

type Row = Record<string, unknown>;

async function insert(table: string, rows: Row | Row[]): Promise<Row[]> {
  const { data, error } = await admin.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Row[];
}

async function insertOne(table: string, row: Row): Promise<Row> {
  const [first] = await insert(table, row);
  if (!first) throw new Error(`${table}: no row returned`);
  return first;
}

async function rpc(client: typeof admin, fn: string, args: Row): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------- users
const USERS = {
  owner: "demo-owner@demo.test",
  member: "demo-member@demo.test",
  viewer: "demo-viewer@demo.test",
} as const;

const ids: Record<string, string> = {};
for (const [role, email] of Object.entries(USERS)) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  ids[role] = data.user.id;
}
// The product owner is the only platform operator (PD-12 A).
await insert("platform_operators", { user_id: ids.owner, note: "demo owner" });

const ownerClient = createClient(url, publishableKey, noSession);
{
  const { error } = await ownerClient.auth.signInWithPassword({ email: USERS.owner, password });
  if (error) throw new Error(`signIn: ${error.message}`);
}
const workspaceId = (await rpc(ownerClient, "create_workspace", { p_name: "Démo" })) as string;
for (const role of ["member", "viewer"] as const) {
  await rpc(admin, "sor_add_member_by_email", {
    p_workspace_id: workspaceId,
    p_actor: ids.owner,
    p_email: USERS[role],
    p_role: role,
  });
}

// ---------------------------------------------------------------- catalog
const { data: categories } = await admin.from("categories").select("id, slug");
const categoryId = (slug: string) => {
  const c = (categories ?? []).find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown category ${slug}`);
  return c.id as string;
};
const { data: officialSource } = await admin
  .from("sources")
  .select("id")
  .eq("source_key", "official_website")
  .single();
const sourceId = officialSource?.id as string;

await insert("fx_rates", [
  { currency: "USD", rate_date: "2026-11-03", rate_to_eur: 0.92, source_key: "demo-fixture" },
  { currency: "CAD", rate_date: "2026-11-03", rate_to_eur: 0.66, source_key: "demo-fixture" },
]);

interface Plan {
  name: string;
  period: "month" | "year" | "custom";
  amount: number | null;
  currency: string | null;
  free_trial?: boolean;
  free_plan?: boolean;
  per_user?: boolean;
  custom?: boolean;
}
interface Fixture {
  key: string;
  name: string;
  tagline: string;
  description?: string;
  company?: {
    name: string;
    country: string | null;
    founded: number | null;
    min: number | null;
    max: number | null;
    type: string;
    founderLed: boolean | null;
    funding: string;
    founder?: string;
  };
  launch?: number;
  customer: string;
  billing: string[];
  pricing: string;
  category: string;
  secondaryCategory?: string;
  status: "eligible" | "needs_review" | "excluded";
  matchedRules?: string[];
  plans?: Plan[];
  features?: Array<[string, boolean]>;
  integrations?: Array<[string, string]>;
  payingCustomers?: boolean;
  reviewCount?: number;
}

const FIXTURES: Fixture[] = [
  {
    key: "metricflow",
    name: "MetricFlow",
    tagline:
      "Centralise les données marketing et détecte les anomalies de vos campagnes publicitaires.",
    description: "Tableaux de bord marketing et alertes d'anomalies pour les agences.",
    company: {
      name: "MetricFlow Labs",
      country: "US",
      founded: 2019,
      min: 6,
      max: 8,
      type: "independent",
      founderLed: true,
      funding: "bootstrapped",
      founder: "Alex Demo",
    },
    customer: "b2b",
    billing: ["monthly_subscription", "annual_subscription"],
    pricing: "paid",
    category: "marketing-growth-marketing-analytics",
    secondaryCategory: "marketing-growth-advertising-management",
    status: "eligible",
    plans: [
      { name: "Starter", period: "month", amount: 29, currency: "USD", free_trial: true },
      { name: "Pro", period: "month", amount: 99, currency: "USD", per_user: true },
    ],
    features: [
      ["Tableaux de bord", true],
      ["Détection d'anomalies", true],
      ["Alertes Slack", false],
    ],
    integrations: [
      ["Google Ads", "marketing"],
      ["HubSpot", "crm"],
      ["Slack", "communication"],
    ],
    payingCustomers: true,
    reviewCount: 42,
  },
  {
    key: "leadnest",
    name: "LeadNest",
    tagline: "Logiciel de génération de leads pour les artisans et les petites agences.",
    company: {
      name: "LeadNest SAS",
      country: "FR",
      founded: 2021,
      min: 3,
      max: 4,
      type: "independent",
      founderLed: true,
      funding: "bootstrapped",
    },
    customer: "b2b",
    billing: ["freemium", "monthly_subscription"],
    pricing: "freemium",
    category: "marketing-growth-lead-generation",
    status: "eligible",
    plans: [
      { name: "Gratuit", period: "month", amount: 0, currency: "EUR", free_plan: true },
      { name: "Essentiel", period: "month", amount: 19, currency: "EUR" },
    ],
    features: [
      ["Formulaires", true],
      ["Scoring de leads", false],
    ],
  },
  {
    key: "mailtide",
    name: "Mailtide",
    tagline: "Email marketing automation for growing ecommerce brands.",
    company: {
      name: "Mailtide Inc",
      country: "US",
      founded: 2015,
      min: 40,
      max: 50,
      type: "independent",
      founderLed: false,
      funding: "externally_funded",
    },
    customer: "b2b_b2c",
    billing: ["monthly_subscription"],
    pricing: "paid",
    category: "marketing-growth-email-marketing",
    status: "eligible",
    plans: [{ name: "Growth", period: "month", amount: 49, currency: "USD" }],
    features: [
      ["Email automation", true],
      ["Segmentation", true],
      ["A/B testing", true],
      ["SMS", false],
    ],
  },
  {
    key: "postwise",
    name: "Postwise",
    tagline: "Schedule social posts for small teams.",
    company: {
      name: "Postwise",
      country: "CA",
      founded: 2025,
      min: null,
      max: null,
      type: "unknown",
      founderLed: null,
      funding: "unknown",
    },
    customer: "unknown",
    billing: [],
    pricing: "unknown",
    category: "marketing-growth-social-media-management",
    status: "eligible",
  },
  {
    key: "campaignboard",
    name: "CampaignBoard",
    tagline: "Pilotage des campagnes multicanales pour les équipes marketing.",
    company: {
      name: "CampaignBoard",
      country: "FR",
      founded: 2018,
      min: null,
      max: null,
      type: "subsidiary",
      founderLed: false,
      funding: "externally_funded",
    },
    customer: "b2b",
    billing: ["annual_subscription"],
    pricing: "custom",
    category: "marketing-growth-campaign-management",
    status: "eligible",
    plans: [{ name: "Entreprise", period: "custom", amount: null, currency: null, custom: true }],
    features: [
      ["Calendrier de campagnes", true],
      ["Tableaux de bord", true],
      ["Workflows d'approbation", true],
      ["Budget", true],
    ],
  },
  {
    key: "loglantern",
    name: "LogLantern",
    tagline: "Log monitoring for small engineering teams.",
    company: {
      name: "LogLantern",
      country: "US",
      founded: 2020,
      min: 10,
      max: 12,
      type: "independent",
      founderLed: true,
      funding: "bootstrapped",
    },
    customer: "b2b",
    billing: ["usage_based"],
    pricing: "paid",
    category: "developer-tools-monitoring",
    status: "eligible",
    plans: [{ name: "Usage", period: "month", amount: 15, currency: "USD" }],
  },
  {
    key: "partnerly",
    name: "Partnerly Hub",
    tagline: "Revenue sharing for SaaS companies.",
    description: "Onboard new partners and share revenue.",
    company: {
      name: "Partnerly",
      country: "US",
      founded: 2022,
      min: 2,
      max: 3,
      type: "independent",
      founderLed: true,
      funding: "bootstrapped",
    },
    customer: "b2b",
    billing: ["monthly_subscription"],
    pricing: "paid",
    category: "sales-crm-sales-automation",
    status: "needs_review",
    matchedRules: ["R7"],
  },
  {
    key: "affilitrack",
    name: "AffiliTrack",
    tagline: "Affiliate tracking software for ecommerce brands.",
    company: {
      name: "AffiliTrack",
      country: "US",
      founded: 2017,
      min: 5,
      max: 10,
      type: "independent",
      founderLed: true,
      funding: "bootstrapped",
    },
    customer: "b2b",
    billing: ["monthly_subscription"],
    pricing: "paid",
    category: "marketing-growth-attribution",
    status: "excluded",
    matchedRules: ["R2"],
  },
];

const productIds: Record<string, string> = {};
const snapshotIds: Record<string, string> = {};
for (const f of FIXTURES) {
  const site = `https://${f.key}.test/`;
  const record = await insertOne("source_records", {
    source_id: sourceId,
    canonical_url: site,
    title: `${f.name} — site officiel`,
  });
  const hash = Array.from(f.key.padEnd(64, "0"))
    .map((ch) => ch.charCodeAt(0).toString(16).slice(-1))
    .join("")
    .slice(0, 64);
  const snapshot = await insertOne("source_snapshots", {
    source_record_id: record.id,
    content_hash: hash,
    fetch_status: "ok",
    storage_status: "reference_only",
    extracted_metadata: { demo_fixture: true },
    extraction_status: "completed",
  });

  snapshotIds[f.key] = snapshot.id as string;
  let companyId: string | null = null;
  if (f.company) {
    const company = await insertOne("companies", {
      name: f.company.name,
      slug: `${f.key}-company`,
      website_url: site,
      country_code: f.company.country,
      founded_year: f.company.founded,
      employee_min: f.company.min,
      employee_max: f.company.max,
      company_type: f.company.type,
      founder_led: f.company.founderLed,
      funding_status: f.company.funding,
    });
    companyId = company.id as string;
  }
  const product = await insertOne("saas_products", {
    company_id: companyId,
    name: f.name,
    slug: f.key,
    website_url: site,
    primary_domain: `${f.key}.test`,
    tagline: f.tagline,
    description: f.description ?? null,
    customer_type: f.customer,
    billing_models: f.billing,
    pricing_status: f.pricing,
    launch_year: f.launch ?? null,
    record_status: f.status === "eligible" ? "active" : "candidate",
    exclusion_status: f.status,
    discovery_source_id: sourceId,
  });
  const productId = product.id as string;
  productIds[f.key] = productId;
  await insert("product_exclusion_assessments", {
    product_id: productId,
    status: f.status,
    rule_set_version: "excl-1",
    matched_rules: (f.matchedRules ?? []).map((ruleKey) => ({ ruleKey, field: "core" })),
    decided_by: "rule_engine",
  });
  await insert("product_categories", [
    { product_id: productId, category_id: categoryId(f.category), is_primary: true },
    ...(f.secondaryCategory
      ? [{ product_id: productId, category_id: categoryId(f.secondaryCategory), is_primary: false }]
      : []),
  ]);

  const evidence = async (claim_type: string, claim_text: string, extra: Row = {}) =>
    (
      await insertOne("evidence_items", {
        product_id: productId,
        source_snapshot_id: snapshot.id,
        claim_type,
        claim_text,
        evidence_type: "official_statement",
        fact_status: "confirmed",
        reliability_level: 1,
        extraction_method: "structured_parse",
        ...extra,
      })
    ).id as string;

  const exists = await evidence("product_exists", `${f.name} est présenté sur son site officiel`);
  await insert("catalog_field_provenance", [
    { product_id: productId, field_key: "name", evidence_id: exists, fact_status: "confirmed" },
    {
      product_id: productId,
      field_key: "website_url",
      evidence_id: exists,
      fact_status: "confirmed",
    },
    { product_id: productId, field_key: "tagline", evidence_id: exists, fact_status: "confirmed" },
  ]);
  if (companyId && f.company) {
    const companyEvidence = (
      await insertOne("evidence_items", {
        company_id: companyId,
        source_snapshot_id: snapshot.id,
        claim_type: "company_profile",
        claim_text: `Page « À propos » de ${f.company.name}`,
        evidence_type: "official_statement",
        fact_status: "declared",
        reliability_level: 1,
        extraction_method: "structured_parse",
      })
    ).id as string;
    const fields = [
      f.company.country && "country_code",
      f.company.founded && "founded_year",
      f.company.max !== null && "employee_count",
    ].filter(Boolean) as string[];
    if (fields.length) {
      await insert(
        "catalog_field_provenance",
        fields.map((field_key) => ({
          company_id: companyId,
          field_key,
          evidence_id: companyEvidence,
          fact_status: "declared",
        })),
      );
    }
    if (f.company.founder) {
      await insert("company_people", {
        company_id: companyId,
        full_name: f.company.founder,
        role: "founder",
        evidence_id: companyEvidence,
        fact_status: "declared",
      });
    }
  }
  if (f.plans?.length) {
    const pricingEvidence = await evidence("pricing", `Page tarifs de ${f.name}`, {
      evidence_type: "pricing_evidence",
      monetization_signal: f.plans.some((p) => (p.amount ?? 0) > 0) ? "paid_plan_available" : null,
    });
    await insert(
      "pricing_plans",
      f.plans.map((p, i) => ({
        product_id: productId,
        plan_name: p.name,
        billing_period: p.period,
        price_amount: p.amount,
        currency: p.currency,
        has_free_trial: p.free_trial ?? null,
        has_free_plan: p.free_plan ?? null,
        price_per_user: p.per_user ?? null,
        custom_pricing: p.custom ?? null,
        is_entry_plan: i === 0,
        is_enterprise_plan: p.period === "custom",
        evidence_id: pricingEvidence,
      })),
    );
  }
  if (f.features?.length) {
    const featureEvidence = await evidence("feature", `Page fonctionnalités de ${f.name}`);
    await insert(
      "product_features",
      f.features.map(([name, primary]) => ({
        product_id: productId,
        name,
        is_primary: primary,
        availability: "available",
        evidence_id: featureEvidence,
      })),
    );
  }
  if (f.integrations?.length) {
    const integrationEvidence = await evidence("integration", `Page intégrations de ${f.name}`);
    await insert(
      "product_integrations",
      f.integrations.map(([name, cat]) => ({
        product_id: productId,
        name,
        integration_category: cat,
        availability: "available",
        evidence_id: integrationEvidence,
      })),
    );
  }
  if (f.payingCustomers) {
    await evidence("paid_customer_signal", `Étude de cas d'un client payant de ${f.name}`, {
      evidence_type: "customer_case_study",
      monetization_signal: "customer_verified",
      verification_status: "verified",
      verified_at: new Date().toISOString(),
    });
  }
  if (f.reviewCount) {
    const reviewEvidence = await evidence("traction_signal", `${f.reviewCount} avis publiés`, {
      evidence_type: "public_metric",
    });
    await insert("company_signals", {
      product_id: productId,
      signal_type: "review_count",
      signal_value: { count: f.reviewCount },
      signal_date: "2026-10-01",
      evidence_id: reviewEvidence,
      fact_status: "confirmed",
    });
  }
}

const linkEvidence = async (product: string, text: string) =>
  (
    await insertOne("evidence_items", {
      product_id: productIds[product],
      source_snapshot_id: snapshotIds[product],
      claim_type: "competitor_relation",
      claim_text: text,
      evidence_type: "inference",
      fact_status: "estimated",
      reliability_level: 4,
      extraction_method: "manual_entry",
    })
  ).id as string;

await insert("competitor_links", [
  {
    product_id: productIds.metricflow,
    competitor_product_id: productIds.campaignboard,
    relationship_type: "direct",
    explanation: "Même acheteur, pilotage de campagnes plus large",
    evidence_id: await linkEvidence(
      "metricflow",
      "CampaignBoard cible les mêmes équipes marketing",
    ),
  },
  {
    product_id: productIds.metricflow,
    competitor_product_id: productIds.leadnest,
    relationship_type: "indirect",
    explanation: "Acquisition plutôt qu'analyse",
  },
  {
    product_id: productIds.metricflow,
    competitor_product_id: productIds.affilitrack,
    relationship_type: "indirect",
    explanation: "Exclu : ne doit jamais apparaître",
  },
]);

process.stdout.write(
  `${JSON.stringify({ seeded: true, workspace_id: workspaceId, products: Object.keys(productIds).length })}\n`,
);
