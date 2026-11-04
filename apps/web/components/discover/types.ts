import type { CatalogFilters, CatalogSort, ResearchPreferences } from "@sor/contracts";

export interface CategoryOption {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
}

export interface DiscoverProps {
  workspaceId: string;
  canEdit: boolean;
  categories: CategoryOption[];
  savedSearches: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
  preferences: ResearchPreferences;
  initialFilters: CatalogFilters;
  initialSort: CatalogSort;
  initialSearchName: string | null;
}

export type ViewMode = "feed" | "grid" | "list";
