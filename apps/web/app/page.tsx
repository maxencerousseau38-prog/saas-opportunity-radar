import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberships, getSession } from "@/lib/auth";

export const metadata = {
  title: "SaaS Opportunity Radar — Démonstration",
  description: "Démonstration publique de SaaS Opportunity Radar, accessible sans compte.",
};

const EXAMPLES = [
  {
    name: "Northstar Metrics",
    category: "Marketing analytics",
    description: "Centralise les données marketing et signale les anomalies de campagnes.",
    pricing: "À partir de 29 $ / mois",
    signal: "Abonnement payant",
  },
  {
    name: "FlowPilot",
    category: "Lead generation",
    description: "Aide les petites équipes à qualifier et organiser leurs prospects.",
    pricing: "Gratuit · offre payante",
    signal: "Freemium",
  },
  {
    name: "SignalDesk",
    category: "Email marketing",
    description: "Automatisation et segmentation des campagnes e-mail.",
    pricing: "À partir de 49 $ / mois",
    signal: "Abonnement payant",
  },
  {
    name: "Orbit Campaigns",
    category: "Campaign management",
    description: "Planification et suivi des campagnes multicanales.",
    pricing: "Tarification sur devis",
    signal: "Offre entreprise",
  },
] as const;

export default async function HomePage() {
  const { user } = await getSession();
  if (user) {
    const memberships = await getMemberships(user.id);
    const first = memberships[0];
    redirect(first ? `/w/${first.workspaceId}/discover` : "/onboarding");
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className="font-semibold tracking-tight">
            SaaS Opportunity Radar
          </Link>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
            Démonstration publique · sans compte
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:pb-16 sm:pt-24">
        <p className="mb-4 text-sm font-medium text-accent">Recherche SaaS fondée sur les preuves</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Repère les SaaS qui méritent vraiment ton attention.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          Parcours cette démonstration sans créer de compte. Découvre comment les logiciels,
          leurs positionnements et leurs signaux commerciaux peuvent être présentés.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#catalogue"
            className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            Explorer la démonstration
          </a>
          <a
            href="#fonctionnalites"
            className="rounded-lg border border-border px-5 py-3 text-sm font-semibold hover:bg-surface"
          >
            Voir les fonctionnalités
          </a>
        </div>
      </section>

      <section id="catalogue" className="border-y border-border bg-surface/60">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-accent">Aperçu du produit</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Discover
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted">
                Un exemple de la manière dont les logiciels peuvent être présentés et comparés.
              </p>
            </div>
            <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">
              Données fictives de démonstration
            </span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {EXAMPLES.map((item) => (
              <article key={item.name} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                    {item.category}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-muted">{item.description}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="text-sm font-medium">{item.pricing}</span>
                  <span className="text-xs text-muted">{item.signal}</span>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-5 text-xs leading-5 text-muted">
            Ces noms, descriptions et informations sont des exemples fictifs. Cette démonstration
            est en lecture seule : aucune recherche, sauvegarde ou donnée de compte n’est modifiée.
          </p>
        </div>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">Découvrir</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Parcourir un catalogue et filtrer les logiciels selon leur marché et leur modèle.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Évaluer</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Examiner les informations disponibles, les prix et les signaux commerciaux.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Organiser</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Retrouver ses recherches et suivre ses pistes dans un espace de travail personnel.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted">
          <span>SaaS Opportunity Radar</span>
          <span>Démo publique sans compte · Espaces privés et actions d’écriture protégés</span>
        </div>
      </footer>
    </main>
  );
}
