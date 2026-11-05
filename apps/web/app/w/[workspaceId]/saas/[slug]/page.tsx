import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { catalogRepo, pipelineRepo, workspaceRepo } from "@sor/database";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Unknown } from "@/components/ui/states";
import { ProductLogo } from "@/components/discover/product-card";
import { Row, Section, Sourced } from "@/components/profile/sourced";
import { CompetitorTable } from "@/components/profile/competitor-table";
import { WorkspacePanel } from "@/components/profile/workspace-panel";
import {
  AVAILABILITY,
  BILLING_MODEL,
  CUSTOMER_TYPE,
  FACT_STATUS,
  PRICING_STATUS,
  RELIABILITY,
  SIGNAL_TYPE,
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

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-4">
        <ProductLogo name={product.name} logoUrl={product.logo_url} size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          {product.website_url ? (
            <a
              href={product.website_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              {product.website_url} <ExternalLink size={12} />
            </a>
          ) : null}
          <p className="text-sm">
            {product.tagline ?? product.short_description ?? (
              <Unknown label="Description non renseignée" />
            )}
          </p>
          <div className="flex flex-wrap gap-1">
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
          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm">
            <div>
              <dt className="inline text-muted">Pays : </dt>
              <dd className="inline">
                {countryName(c?.country_code.value ?? null) ?? <Unknown />}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted">Création : </dt>
              <dd className="inline">
                {c?.founded_year.value ?? product.launch_year ?? <Unknown />}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted">Effectif : </dt>
              <dd className="inline">{team ?? <Unknown />}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Tarification : </dt>
              <dd className="inline">{PRICING_STATUS[product.pricing_status]}</dd>
            </div>
          </dl>
          {canEdit(membership.role) ? (
            <div className="pt-2">
              <AnalyzeButton
                workspaceId={workspaceId}
                subject={{ type: "product", product_id: product.id }}
                defaults={defaults}
              />
            </div>
          ) : null}
        </div>
        <WorkspacePanel
          workspaceId={workspaceId}
          productId={product.id}
          productName={product.name}
          canEdit={canEdit(membership.role)}
          state={state}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          productTagIds={productTags.map((t) => t.tag_id)}
          collections={collections.map((col) => ({ id: col.id, name: col.name }))}
          productCollectionIds={productCollections.map((pc) => pc.collection_id)}
        />
      </header>

      <nav aria-label="Sections de la fiche" className="flex flex-wrap gap-3 text-sm text-muted">
        {[
          ["general", "Général"],
          ["product", "Produit"],
          ["commercial", "Commercial"],
          ["traction", "Traction"],
          ["competitors", "Concurrents"],
          ["feedback", "Avis clients"],
          ["sources", "Sources et fiabilité"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="hover:text-fg">
            {label}
          </a>
        ))}
      </nav>

      <Section
        id="general"
        title="Informations générales"
        note="Chaque valeur indique son statut (confirmé, estimé, déclaré, inconnu) et sa source."
      >
        <dl>
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
          <Row label="Date de création">{c ? <Sourced value={c.founded_year} /> : <Unknown />}</Row>
          <Row label="Lancement du produit">
            <Sourced value={g.launch_year} />
          </Row>
          <Row label="Pays">
            {c ? <Sourced value={c.country_code} render={(v) => countryName(v)} /> : <Unknown />}
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
                  ({ independent: "Indépendante", subsidiary: "Filiale", public_company: "Cotée" })[
                    v
                  ] ?? v
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
        </dl>
      </Section>

      <Section id="product" title="Informations produit">
        <dl>
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
        </dl>
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
                    <a className="text-xs text-muted underline" href={`#evidence-${f.evidence_id}`}>
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
        <dl>
          <Row label="Modèle de facturation">
            <Sourced
              value={g.billing_models}
              render={(v) => v.map((m) => BILLING_MODEL[m] ?? m).join(", ")}
            />
          </Row>
          <Row label="Prix d’entrée indicatif">
            {entry !== null ? `${formatMoney(entry, "EUR")} / mois (converti)` : <Unknown />}
          </Row>
        </dl>
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
            Les connecteurs d’avis et l’import de retours clients arrivent aux Sprints 3 et 4.
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
        <p className="mt-3 text-xs text-muted">
          <Link className="underline" href={`/w/${workspaceId}/discover`}>
            Retour à Discover
          </Link>
        </p>
      </Section>
    </article>
  );
}
