import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberships, getSession } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/workspace/brand";

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
    <main className="min-h-dvh bg-bg">
      <header className="pt-safe sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-5">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">SOR</span>
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Se connecter
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(55%_100%_at_50%_0%,oklch(1_0_0/8%),transparent)]"
        />
        <div className="relative mx-auto max-w-5xl px-5 pt-14 pb-12 text-center sm:pt-24 sm:pb-16">
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted">
            Démonstration publique · sans compte
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-[40px] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            Découvre chaque jour de vrais SaaS.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            Un feed de logiciels existants, leurs clients et leurs failles — pour repérer
            l’opportunité qui mérite d’être construite.
          </p>
          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Ouvrir mon radar
            </Link>
            <a href="#catalogue" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Voir un aperçu
            </a>
          </div>
        </div>
      </section>

      <section id="catalogue" className="mx-auto max-w-5xl scroll-mt-16 px-5 pb-14">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Aperçu du feed</h2>
          <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs text-warning">
            Données fictives de démonstration
          </span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((item) => (
            <li key={item.name}>
              <article className="h-full rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-[22%] border border-border bg-gradient-to-br from-surface-3 to-surface text-lg font-semibold"
                  >
                    {item.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[16px] font-semibold tracking-tight">
                      {item.name}
                    </h3>
                    <p className="truncate text-xs text-muted">{item.category}</p>
                  </div>
                </div>
                <p className="mt-3 text-[15px] leading-snug text-fg/85">{item.description}</p>
                <p className="mt-3 text-xs text-muted">
                  {item.pricing} · {item.signal}
                </p>
              </article>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-5 text-muted">
          Ces noms, descriptions et informations sont des exemples fictifs. Cette démonstration est
          en lecture seule : aucune recherche, sauvegarde ou donnée de compte n’est modifiée.
        </p>
      </section>

      <section id="fonctionnalites" className="border-t border-border">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-14 sm:grid-cols-3">
          {[
            [
              "Découvrir",
              "Scroller un feed de SaaS réels, multi-catégories, avec leurs sources et dates.",
            ],
            ["Comprendre", "Ouvrir une fiche, ses concurrents, ses avis clients et ses preuves."],
            ["Décider", "Sauvegarder, comparer et préparer une analyse avec l’IA de ton choix."],
          ].map(([title, text]) => (
            <div key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="pb-safe mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted">
          <span>SaaS Opportunity Radar</span>
          <span>Démo publique · espaces privés et actions d’écriture protégés</span>
        </div>
      </footer>
    </main>
  );
}
