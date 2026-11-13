import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft, ExternalLink, MessageSquareText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { catalogRepo, pipelineRepo, workspaceRepo } from "@sor/database";
import { Badge } from "@/components/ui/badge";
import { VisualFigure } from "@/components/discover/visual-figure";
import { EmptyState, Unknown } from "@/components/ui/states";
import { ProductLogo } from "@/components/discover/product-card";
import { DetailList, Row, Section, Sourced } from "@/components/profile/sourced";
import { CompetitorTable } from "@/components/profile/competitor-table";
import { WorkspacePanel } from "@/components/profile/workspace-panel";
import { FavoriteButton } from "@/components/profile/favorite-button";
import {
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_CATEGORY,
  ACQUISITION_CHANNEL_STATUS,
  AVAILABILITY,
  BILLING_MODEL,
  CUSTOMER_TYPE,
  FACT_STATUS,
  PRICING_STATUS,
  RELIABILITY,
  SIGNAL_TYPE,
  confidenceLabel,
  countryName,
  formatDate,
  formatMoney,
  isDemoUrl,
  teamLabel,
} from "@/lib/labels";
import {
  buildGeneral,
  entryMonthlyEur,
  getCompetitors,
  getDiscoverDetails,
  recordView,
  sourcesOf,
} from "@/lib/services/catalog";
import { canEdit, requireWorkspace } from "@/lib/workspace";
import { AnalyzeButton } from "@/components/analysis/analyze-form";
import { analysisDefaults } from "@/lib/services/analyses";

const PERIOD: Record<string, string> = {
  month: "/ mois",
  year: "/ an",
  usage: "à l’usage",
  one_time: "paiement unique",
  custom: "sur devis",
  unknown: "période inconnue",
};

export default async function ProfilePage(props: PageProps<"/w/[workspaceId]/saas/[slug]">) {
  const { workspaceId, slug } = await props.params;
  const { client, user, membership } = await requireWorkspace(workspaceId);
  const product = await catalogRepo.getProductBySlug(client, slug);
  if (!product) notFound();

  const [
    provenance,
    features,
    integrations,
    pricing,
    fx,
    signals,
    people,
    feedback,
    evidence,
    competitors,
    state,
    tags,
    productTags,
    collections,
    productCollections,
    discover,
  ] = await Promise.all([
    catalogRepo.listProvenance(client, product.id, product.company_id),
    catalogRepo.listFeatures(client, product.id),
    catalogRepo.listIntegrations(client, product.id),
    catalogRepo.listPricing(client, [product.id]),
    catalogRepo.latestFxRates(client),
    catalogRepo.listSignals(client, product.id, product.company_id),
    product.company_id ? catalogRepo.listPeople(client, product.company_id) : Promise.resolve([]),
    catalogRepo.listFeedback(client, product.id),
    catalogRepo.listEvidence(client, product.id, product.company_id),
    getCompetitors(client, product),
    workspaceRepo.getProductState(client, workspaceId, product.id),
    workspaceRepo.listTags(client, workspaceId),
    workspaceRepo.listProductTags(client, workspaceId, product.id),
    workspaceRepo.listCollections(client, workspaceId),
    workspaceRepo.listProductCollections(client, workspaceId, product.id),
    getDiscoverDetails(client, product.id),
  ]);
  const conflicts = await pipelineRepo.listConflicts(client, product.id);
  const defaults = await analysisDefaults(client, workspaceId);
  if (canEdit(membership.role)) await recordView(client, workspaceId, product.id, user.id);

  const g = buildGeneral(product, provenance);
  const c = g.company;
  const entry = entryMonthlyEur(pricing, fx);
  const sources = sourcesOf(evidence);
  const team = c ? teamLabel(c.employee_min.value, c.employee_max.value) : null;
  const primaryFeatures = features.filter((f) => f.is_primary);
  const secondaryFeatures = features.filter((f) => !f.is_primary);
  const monetization = evidence.some(
    (e) =>
      e.verification_status === "verified" &&
      (e.monetization_signal === "payment_confirmed" ||
        e.monetization_signal === "customer_verified"),
  )
    ? { tone: "success" as const, label: "Clients payants vérifiés" }
    : pricing.some((p) => Number(p.price_amount) > 0)
      ? { tone: "warning" as const, label: "Offre payante publiée (clients non prouvés)" }
      : { tone: "neutral" as const, label: "Monétisation non établie" };

  const primaryCat = g.categories.find((cat) => cat.is_primary) ?? g.categories[0];
  const sentence = product.tagline ?? product.short_description;
  const editable = canEdit(membership.role);
  const facts: Array<[string, ReactNode]> = [
    ["Catégorie", primaryCat ? primaryCat.name : <Unknown label="Non classé" />],
    [
      "Clientèle",
      product.customer_type === "unknown" ? (
        <Unknown />
      ) : (
        (CUSTOMER_TYPE[product.customer_type] ?? product.customer_type)
      ),
    ],
    ["Pays", countryName(c?.country_code.value ?? null) ?? <Unknown />],
    ["Création", c?.founded_year.value ?? product.launch_year ?? <Unknown />],
    ["Effectif", team ?? <Unknown />],
    ["Tarification", PRICING_STATUS[product.pricing_status]],
  ];

  return (
    <article className="mx-auto max-w-6xl">
      <Link
        href={`/w/${workspaceId}/discover`}
        className="mb-3 inline-flex h-9 items-center gap-1 rounded-full pr-3 text-sm text-muted transition-colors hover:text-fg"
      >
        <ChevronLeft size={18} aria-hidden /> Discover
      </Link>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <header className="min-w-0 space-y-4 lg:col-start-1">
          {discover.visual_asset ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <VisualFigure
                asset={discover.visual_asset}
                observedLabel={formatDate(discover.visual_asset.observed_at) ?? "date inconnue"}
              />
            </div>
          ) : null}

          <div className="flex items-start gap-4">
            <ProductLogo name={product.name} logoUrl={product.logo_url} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight sm:text-3xl">
                {product.name}
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {primaryCat?.name ?? "Non classé"}
                {product.website_url ? (
                  <>
                    {" · "}
                    <a
                      href={product.website_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline-offset-4 hover:text-fg hover:underline"
                    >
                      {product.primary_domain ?? product.website_url}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <p className="text-[17px] leading-relaxed text-fg/90">
            {sentence ?? <Unknown label="Description non renseignée" />}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {g.categories.map((cat) => (
              <Badge key={cat.slug} tone={cat.is_primary ? "accent" : "neutral"}>
                {cat.name}
              </Badge>
            ))}
            <Badge tone={monetization.tone}>{monetization.label}</Badge>
            {isDemoUrl(product.website_url) ? (
              <Badge tone="warning">Donnée de démonstration</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <FavoriteButton
              workspaceId={workspaceId}
              productId={product.id}
              productName={product.name}
              initial={state?.is_favorite ?? false}
              canEdit={editable}
            />
            {product.website_url ? (
              <a
                href={product.website_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={buttonVariants({ variant: "primary", className: "flex-1 sm:flex-none" })}
              >
                Site officiel <ExternalLink size={15} aria-hidden />
              </a>
            ) : null}
            {editable ? (
              <Link
                href={`/w/${workspaceId}/ask-ai?products=${product.id}`}
                className={buttonVariants({
                  variant: "secondary",
                  className: "flex-1 sm:flex-none",
                })}
              >
                <MessageSquareText size={15} aria-hidden /> Ask AI
              </Link>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 truncate text-[15px] font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="order-last lg:sticky lg:top-8 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <WorkspacePanel
            workspaceId={workspaceId}
            productId={product.id}
            productName={product.name}
            canEdit={editable}
            state={state}
            tags={tags.map((t) => ({ id: t.id, name: t.name }))}
            productTagIds={productTags.map((t) => t.tag_id)}
            collections={collections.map((col) => ({ id: col.id, name: col.name }))}
            productCollectionIds={productCollections.map((pc) => pc.collection_id)}
          />
          {editable ? (
            <div
              id="internal-analysis"
              className="mt-4 scroll-mt-24 rounded-2xl border border-border bg-surface p-4"
            >
              <h2 className="text-[15px] font-semibold tracking-tight">Analyse approfondie</h2>
              <p className="mt-1 mb-3 text-xs text-muted">
                Score, confiance et verdict calculés par SOR à partir des preuves.
              </p>
              <AnalyzeButton
                workspaceId={workspaceId}
                subject={{ type: "product", product_id: product.id }}
                defaults={defaults}
                variant="outline"
                className="w-full"
              />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-1">
          <nav
            aria-label="Sections de la fiche"
            className="scrollbar-none sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-bg/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0"
          >
            {[
              ["general", "Général"],
              ["product", "Produit"],
              ["commercial", "Commercial"],
              ["traction", "Traction"],
              ["acquisition", "Acquisition"],
              ["competitors", "Concurrents"],
              ["feedback", "Avis clients"],
              ["sources", "Sources"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="h-8 shrink-0 rounded-full border border-border px-3 text-[13px] leading-8 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {label}
              </a>
            ))}
          </nav>

          <Section
            id="general"
            title="Informations générales"
            note="Chaque valeur indique son statut (confirmé, estimé, déclaré, inconnu) et sa source."
          >
            <DetailList>
              <Row label="Nom commercial">
                <Sourced value={g.name} />
              </Row>
              <Row label="Nom juridique">{c ? <Sourced value={c.legal_name} /> : <Unknown />}</Row>
              <Row label="URL principale">
                <Sourced value={g.website_url} />
              </Row>
              <Row label="Entreprise">
                {c ? <Sourced value={c.name} /> : <Unknown label="Entreprise inconnue" />}
              </Row>
              <Row label="Date de création">
                {c ? <Sourced value={c.founded_year} /> : <Unknown />}
              </Row>
              <Row label="Lancement du produit">
                <Sourced value={g.launch_year} />
              </Row>
              <Row label="Pays">
                {c ? (
                  <Sourced value={c.country_code} render={(v) => countryName(v)} />
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="Ville">{c ? <Sourced value={c.city} /> : <Unknown />}</Row>
              <Row label="Fondateurs et dirigeants">
                {people.length ? (
                  <ul>
                    {people.map((p) => (
                      <li key={p.id}>
                        {p.full_name} — {p.role}{" "}
                        <span className="text-xs text-muted">
                          ({FACT_STATUS[p.fact_status]},{" "}
                          <a className="underline" href={`#evidence-${p.evidence_id}`}>
                            source
                          </a>
                          )
                        </span>
                        {p.public_profile_url ? (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              className="text-accent underline"
                              href={p.public_profile_url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                            >
                              profil public
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="Effectif">
                {c ? (
                  team ? (
                    <Sourced
                      value={c.employee_max.value !== null ? c.employee_max : c.employee_min}
                      render={() => team}
                    />
                  ) : (
                    <Unknown />
                  )
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="LinkedIn">
                {c ? (
                  <Sourced
                    value={c.linkedin_url}
                    render={(v) => (
                      <a
                        className="text-accent underline"
                        href={v}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        {v}
                      </a>
                    )}
                  />
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="Statut">
                {c ? (
                  <Sourced
                    value={c.company_type}
                    render={(v) =>
                      ({
                        independent: "Indépendante",
                        subsidiary: "Filiale",
                        public_company: "Cotée",
                      })[v] ?? v
                    }
                  />
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="Financement">
                {c ? (
                  <Sourced
                    value={c.funding_status}
                    render={(v) =>
                      ({
                        bootstrapped: "Autofinancée",
                        externally_funded: "Financement externe connu",
                      })[v] ?? v
                    }
                  />
                ) : (
                  <Unknown />
                )}
              </Row>
              <Row label="Description officielle">
                <Sourced value={g.description} />
              </Row>
            </DetailList>
          </Section>

          <Section id="product" title="Informations produit">
            <DetailList>
              <Row label="Problème résolu">
                <Sourced value={g.problem_solved} />
              </Row>
              <Row label="Clientèle cible">
                <Sourced value={g.customer_type} render={(v) => CUSTOMER_TYPE[v] ?? v} />
              </Row>
              <Row label="Proposition de valeur">
                <Sourced value={g.value_proposition} />
              </Row>
              <Row label="Cas d’utilisation">
                <Sourced value={g.use_cases} render={(v) => v.join(", ")} />
              </Row>
              <Row label="Compatibilités">
                <Sourced value={g.compatibilities} render={(v) => v.join(", ")} />
              </Row>
              <Row label="Plateformes">
                <Sourced value={g.technology_tags} render={(v) => v.join(", ")} />
              </Row>
              <Row label="Documentation">
                <Sourced
                  value={g.documentation_url}
                  render={(v) => (
                    <a
                      className="text-accent underline"
                      href={v}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {v}
                    </a>
                  )}
                />
              </Row>
              <Row label="Complexité">
                <Sourced value={g.complexity_level} />
              </Row>
              <Row label="Langues">
                <Sourced value={g.languages} render={(v) => v.join(", ")} />
              </Row>
              <Row label="Marchés desservis">
                <Sourced
                  value={g.served_countries}
                  render={(v) => v.map((x) => countryName(x)).join(", ")}
                />
              </Row>
            </DetailList>
            <h3 className="mt-4 text-sm font-semibold">Fonctionnalités</h3>
            {features.length ? (
              <ul className="mt-1 space-y-1 text-sm">
                {[...primaryFeatures, ...secondaryFeatures].map((f) => (
                  <li key={f.id}>
                    {f.is_primary ? <Badge tone="accent">Principale</Badge> : null} {f.name} —{" "}
                    {AVAILABILITY[f.availability]}
                    {f.evidence_id ? (
                      <>
                        {" "}
                        <a
                          className="text-xs text-muted underline"
                          href={`#evidence-${f.evidence_id}`}
                        >
                          source
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                <Unknown label="Aucune fonctionnalité recensée (cela ne prouve pas leur absence)" />
              </p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Intégrations</h3>
            {integrations.length ? (
              <ul className="mt-1 flex flex-wrap gap-1">
                {integrations.map((i) => (
                  <li key={i.id}>
                    <Badge>
                      {i.name} · {AVAILABILITY[i.availability]}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                <Unknown label="Aucune intégration recensée" />
              </p>
            )}
          </Section>

          <Section
            id="commercial"
            title="Informations commerciales"
            note="Une offre payante publiée ne prouve pas l’existence de clients payants. Les prix sont affichés dans leur devise d’origine."
          >
            <DetailList>
              <Row label="Modèle de facturation">
                <Sourced
                  value={g.billing_models}
                  render={(v) => v.map((m) => BILLING_MODEL[m] ?? m).join(", ")}
                />
              </Row>
              <Row label="Prix d’entrée indicatif">
                {entry !== null ? `${formatMoney(entry, "EUR")} / mois (converti)` : <Unknown />}
              </Row>
            </DetailList>
            {pricing.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3">Offre</th>
                      <th className="py-1 pr-3">Prix</th>
                      <th className="py-1 pr-3">Caractéristiques</th>
                      <th className="py-1 pr-3">Vérifié le</th>
                      <th className="py-1">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1 pr-3">{p.plan_name}</td>
                        <td className="py-1 pr-3">
                          {p.custom_pricing ? (
                            "Sur devis"
                          ) : p.price_amount === null ? (
                            <Unknown />
                          ) : (
                            `${formatMoney(Number(p.price_amount), p.currency)} ${PERIOD[p.billing_period] ?? ""}`
                          )}
                        </td>
                        <td className="py-1 pr-3 text-xs">
                          {[
                            p.price_per_user && "par utilisateur",
                            p.has_free_trial && "essai gratuit",
                            p.has_free_plan && "version gratuite",
                            p.is_entry_plan && "offre d’entrée",
                            p.is_enterprise_plan && "offre entreprise",
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="py-1 pr-3">{formatDate(p.checked_at)}</td>
                        <td className="py-1">
                          <a className="underline" href={`#evidence-${p.evidence_id}`}>
                            source
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm">
                <Unknown label="Aucune offre tarifaire recensée" />
              </p>
            )}
          </Section>

          <Section
            id="traction"
            title="Signaux de traction"
            note="Les estimations de trafic ne sont jamais des visites mesurées."
          >
            {signals.length ? (
              <ul className="space-y-1 text-sm">
                {signals.map((s) => (
                  <li key={s.id}>
                    {SIGNAL_TYPE[s.signal_type] ?? s.signal_type} :{" "}
                    <code className="text-xs">{JSON.stringify(s.signal_value)}</code>{" "}
                    <span className="text-xs text-muted">
                      ({FACT_STATUS[s.fact_status]}
                      {s.signal_date ? `, ${formatDate(s.signal_date)}` : ""},{" "}
                      <a className="underline" href={`#evidence-${s.evidence_id}`}>
                        source
                      </a>
                      )
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                <Unknown label="Aucun signal de traction recensé" />
              </p>
            )}
          </Section>

          <Section
            id="acquisition"
            title="Acquisition Channels"
            note="Canaux que ce SaaS utilise pour acquérir ses clients, avec leur preuve. Distincts des sources du catalogue et des recommandations Go-to-Market. Une absence de canal n’est pas une preuve d’absence."
          >
            {discover.acquisition_channels.length ? (
              <ul className="space-y-3">
                {discover.acquisition_channels.map((ch) => (
                  <li key={`${ch.channel_key}:${ch.evidence_id}`} className="space-y-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {ch.role === "primary" ? "★ Canal principal : " : "Canal secondaire : "}
                        {ACQUISITION_CHANNEL[ch.channel_key] ?? ch.channel_key}
                      </span>
                      <Badge>
                        {ACQUISITION_CHANNEL_CATEGORY[ch.channel_category] ?? ch.channel_category}
                      </Badge>
                      <Badge
                        tone={
                          ch.status === "confirmed"
                            ? "success"
                            : ch.status === "estimated"
                              ? "warning"
                              : "accent"
                        }
                      >
                        {ACQUISITION_CHANNEL_STATUS[ch.status] ?? ch.status}
                      </Badge>
                      <span className="text-xs text-muted">
                        {confidenceLabel(ch.confidence)} · observé le {formatDate(ch.observed_at)} ·{" "}
                        <a
                          className="text-accent underline"
                          href={ch.source_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          source
                        </a>
                      </span>
                    </p>
                    {ch.role_rationale ? (
                      <p className="text-xs">Principal selon la source : « {ch.role_rationale} »</p>
                    ) : null}
                    {ch.inference_rationale ? (
                      <p className="text-xs">Méthode de l’estimation : {ch.inference_rationale}</p>
                    ) : null}
                    {ch.confidence_reasons.length ? (
                      <p className="text-xs text-muted">
                        Confiance ({ch.confidence_method ?? "méthode inconnue"}) :{" "}
                        {ch.confidence_reasons.join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                <Unknown label="Inconnus / non documentés" />
              </p>
            )}
          </Section>

          <Section id="competitors" title="Concurrents et alternatives">
            <CompetitorTable
              workspaceId={workspaceId}
              subjectId={product.id}
              competitors={competitors.competitors}
            />
          </Section>

          <Section
            id="feedback"
            title="Avis et problèmes clients"
            note="L’analyse des problèmes récurrents arrive avec le moteur Pain Point Intelligence (Sprint 4). Un échantillon d’avis n’est pas représentatif de tous les clients."
          >
            {feedback.length ? (
              <ul className="space-y-2 text-sm">
                {feedback.map((f) => (
                  <li key={f.id} className="border-b border-border pb-2">
                    <p>
                      {f.summarized_text ?? f.original_text ?? (
                        <Unknown label="Contenu non conservé (droits)" />
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {f.source_snapshots?.source_records?.sources?.name ?? "Source inconnue"} ·{" "}
                      {formatDate(f.published_at) ?? "date inconnue"}
                      {f.rating !== null ? ` · note ${f.rating}/${f.rating_scale_max ?? "?"}` : ""}
                      {f.is_near_duplicate_of ? " · doublon probable" : ""}
                      {f.source_snapshots?.source_records?.canonical_url ? (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            className="underline"
                            href={f.source_snapshots.source_records.canonical_url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                          >
                            publication originale
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Aucun avis client collecté">
                Aucun retour client n’est enregistré pour ce produit. Les imports CSV de retours
                sont disponibles dans{" "}
                <Link className="underline" href={`/w/${workspaceId}/settings`}>
                  Paramètres
                </Link>
                ; aucun connecteur d’avis externe n’est actuellement activé.
              </EmptyState>
            )}
          </Section>

          <Section id="sources" title="Sources et fiabilité">
            {sources.length ? (
              <ul className="space-y-3 text-sm">
                {sources.map((s) => (
                  <li key={s.snapshot_id} className="rounded border border-border p-3">
                    <p className="font-medium">
                      {s.url ? (
                        <a
                          className="text-accent underline"
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          {s.title ?? s.url}
                        </a>
                      ) : (
                        (s.title ?? "Source sans URL")
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {s.source_name ?? "Source inconnue"} ({s.source_type ?? "?"}) · collecté le{" "}
                      {formatDate(s.retrieved_at) ?? "?"} · dernière vérification{" "}
                      {formatDate(s.last_retrieved_at) ?? "?"}
                    </p>
                    {s.licence ? (
                      <p className="text-xs text-muted" data-testid="source-licence">
                        Licence / attribution : {s.licence}
                      </p>
                    ) : null}
                    <ul className="mt-2 space-y-1">
                      {s.evidence.map((e) => (
                        <li key={e.id} id={`evidence-${e.id}`} className="scroll-mt-24">
                          <span>{e.claim_text}</span>{" "}
                          <span className="text-xs text-muted">
                            — {FACT_STATUS[e.fact_status]} ·{" "}
                            {RELIABILITY[e.reliability_level] ?? e.reliability_level} ·{" "}
                            {e.verification_status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Aucune source enregistrée" />
            )}
            {conflicts.length ? (
              <div className="mt-4 space-y-2" data-testid="conflicts">
                <h3 className="text-sm font-semibold">
                  Informations contradictoires ({conflicts.length})
                </h3>
                <p className="text-xs text-muted">
                  Les sources ne concordent pas : les deux versions sont conservées, aucune n’écrase
                  l’autre.
                </p>
                <ul className="space-y-1 text-sm">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium">{c.field_key}</span> : « {c.a?.claim_text} » ≠ «{" "}
                      {c.b?.claim_text} »{" "}
                      <span className="text-xs text-muted">
                        ({c.status === "open" ? "non résolu" : c.status})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        </div>
      </div>
    </article>
  );
}
