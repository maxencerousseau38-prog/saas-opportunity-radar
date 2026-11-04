// Workspace service helpers. JSON written through the Data API bypasses Zod,
// so stored settings and saved-search filters are re-validated on every read
// (Implementation Blueprint §4.5): invalid values fall back to defaults and
// are reported.
import "server-only";
import {
  AiPreferencesSchema,
  CatalogFiltersSchema,
  CatalogSortSchema,
  ResearchPreferencesSchema,
} from "@sor/contracts";
import { workspaceRepo, type DbClient } from "@sor/database";

export async function readSettings(client: DbClient, workspaceId: string) {
  const row = await workspaceRepo.getSettings(client, workspaceId);
  const research = ResearchPreferencesSchema.safeParse(row?.research_preferences ?? {});
  const ai = AiPreferencesSchema.safeParse(row?.ai_preferences ?? {});
  return {
    research_preferences: research.success ? research.data : ResearchPreferencesSchema.parse({}),
    ai_preferences: ai.success ? ai.data : AiPreferencesSchema.parse({}),
    invalid_fields: [
      ...(research.success ? [] : ["research_preferences"]),
      ...(ai.success ? [] : ["ai_preferences"]),
    ],
    updated_at: row?.updated_at ?? null,
  };
}

export function toSavedSearchDto(row: workspaceRepo.SavedSearchRow) {
  const filters = CatalogFiltersSchema.safeParse(row.filters ?? {});
  const sort = CatalogSortSchema.safeParse(row.sort_key);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "discovery" ? ("discovery" as const) : ("catalog" as const),
    search_text: row.search_text,
    filters: filters.success ? filters.data : CatalogFiltersSchema.parse({}),
    sort_key: sort.success ? sort.data : ("relevance" as const),
    is_pinned: row.is_pinned,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    invalid: !filters.success || !sort.success,
  };
}
