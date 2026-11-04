import { workspaceRepo } from "@sor/database";
import { ApiError, parseId, workspaceRoute } from "@/lib/api/http";
import { toSavedSearchDto } from "@/lib/services/workspace";

type P = { workspaceId: string; searchId: string };

/** PRD §4.3 "Possibilité de dupliquer une recherche". */
export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user }, p) => {
    const source = await workspaceRepo.getSavedSearch(client, workspaceId, parseId(p.searchId));
    if (!source) throw new ApiError("NOT_FOUND");
    const copy = toSavedSearchDto(source);
    const row = await workspaceRepo.createSavedSearch(client, workspaceId, user.id, {
      name: `${source.name} (copie)`.slice(0, 120),
      kind: copy.kind,
      search_text: copy.search_text,
      filters: copy.filters,
      sort_key: copy.sort_key,
      is_pinned: false,
    });
    return { data: toSavedSearchDto(row) };
  },
  { status: 201 },
);
