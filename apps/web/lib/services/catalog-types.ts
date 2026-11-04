// Client-safe view types of the catalog service.
import type { CategoryRef } from "@sor/contracts";

export interface CompetitorView {
  link_id: string;
  relationship_type: "direct" | "indirect" | "alternative" | "substitute" | "adjacent";
  explanation: string | null;
  similarity_score: number | null;
  evidence_id: string | null;
  product: {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    website_url: string | null;
    logo_url: string | null;
    country_code: string | null;
    pricing_status: string;
    categories: CategoryRef[];
    entry_monthly_eur: number | null;
    available_features: string[];
  };
  facets: { cheaper: boolean; more_advanced: boolean; free: boolean; french: boolean; us: boolean };
}
