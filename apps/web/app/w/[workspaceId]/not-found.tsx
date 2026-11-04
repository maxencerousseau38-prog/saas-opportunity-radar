import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <EmptyState title="Introuvable">
      Cette page n’existe pas ou n’est pas visible pour vous.
    </EmptyState>
  );
}
