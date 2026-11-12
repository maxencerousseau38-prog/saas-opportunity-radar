import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import {
  NewDiscoveryForm,
  type DiscoveryFormDefaults,
} from "@/components/discovery/new-discovery-form";
import { RUN_STATUS, formatDate } from "@/lib/labels";
import { getRun, listRuns, listSources } from "@/lib/services/discovery";
import { canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "AI Discovery — SaaS Opportunity Radar" };

export default async function AiDiscoveryPage(props: PageProps<"/w/[workspaceId]/ai-discovery">) {
  const { workspaceId } = await props.params;
  const search = await props.searchParams;
  const { client, membership } = await requireWorkspace(workspaceId);
  const [runs, sources] = await Promise.all([
    listRuns(client, workspaceId, { limit: 30 }),
    listSources(),
  ]);
  const searchEnabled = sources.data.some(
    (s) => s.source_key === "hacker_news" && s.is_enabled && s.integration_status === "integrated",
  );

  // "Relancer ou modifier" (PRD §6.4): the form starts from a previous run.
  const from = typeof search.from === "string" ? search.from : null;
  const previous = from ? await getRun(client, workspaceId, from).catch(() => null) : null;
  const channels = (previous?.channels ?? {}) as {
    search?: boolean;
    official_site_rebound?: { enabled?: boolean };
    seed_urls?: string[];
  };
  const defaults: DiscoveryFormDefaults = previous
    ? {
        title: previous.title,
        prompt: previous.prompt,
        depth: previous.depth === "deep" ? "deep" : "standard",
        maxResults: previous.max_results,
        search: channels.search ?? true,
        rebound: channels.official_site_rebound?.enabled ?? true,
        seedUrls: channels.seed_urls ?? [],
        filters: (previous.explicit_filters ?? {}) as Record<string, unknown>,
        rerunOf: previous.id,
      }
    : {
        title: "",
        prompt: "",
        depth: "standard",
        maxResults: 30,
        search: true,
        rebound: true,
        seedUrls: [],
        filters: {},
        rerunOf: null,
      };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI Discovery</h1>
        <p className="text-sm text-muted">
          Découvrir de vrais SaaS à partir d’une demande en langage naturel. Chaque candidat est
          vérifié sur son propre site officiel ; la correspondance aux filtres et la confiance des
          preuves sont calculées séparément, par des règles fixes.
        </p>
        <p
          className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm"
          data-testid="simulated-note"
        >
          Interprétation et extraction par un fournisseur d’IA simulé (heuristiques déterministes) :
          le choix du fournisseur réel est en attente (PD-24). Les résultats ne doivent pas être lus
          comme ceux d’un modèle d’IA.
        </p>
      </header>

      {canEdit(membership.role) ? (
        <NewDiscoveryForm
          key={previous?.id ?? "new"}
          workspaceId={workspaceId}
          defaults={defaults}
          searchEnabled={searchEnabled}
        />
      ) : null}

      <section aria-labelledby="runs-title" className="space-y-2">
        <h2 id="runs-title" className="text-lg font-medium">
          Recherches
        </h2>
        {runs.data.length === 0 ? (
          <EmptyState title="Aucune recherche">
            {canEdit(membership.role)
              ? "Lancez une première recherche avec le formulaire ci-dessus."
              : "Les membres de l’espace peuvent lancer des recherches."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {runs.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Link
                  className="font-medium text-accent underline"
                  href={`/w/${workspaceId}/ai-discovery/${r.id}`}
                >
                  {r.title}
                </Link>
                <Badge>{RUN_STATUS[r.status] ?? r.status}</Badge>
                <span className="text-muted">
                  {r.candidates_found} candidat(s) · {r.candidates_retained} retenu(s) ·{" "}
                  {formatDate(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
