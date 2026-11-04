import { EmptyState } from "@/components/ui/states";

export default function AiDiscoveryPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">AI Discovery</h1>
      <EmptyState title="Pas encore disponible">
        La découverte de nouveaux SaaS à partir d’une demande en langage naturel arrive avec le
        moteur Discovery (Sprint 6). Elle dépend du choix des sources de recherche (décision PD-28,
        en attente). En attendant, vous pouvez ajouter un SaaS manuellement depuis Discover.
      </EmptyState>
    </section>
  );
}
