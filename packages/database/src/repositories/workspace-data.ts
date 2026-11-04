// Workspace-owned data (Implementation Blueprint §10 "Workspace organisation").
// User client: RLS enforces membership and roles (§12 matrix); column grants
// protect immutable columns. Functions take the acting user id only to fill
// the `created_by`-style columns that RLS checks against auth.uid().
import type { DbClient } from "../clients";
import { DbError, mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type JsonValue = NonNullable<Json>;

type Tables = Database["public"]["Tables"];
type OpportunityStatus = Database["public"]["Enums"]["opportunity_status"];
type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}

/** Throws NOT_FOUND when RLS (or a wrong id) matched no row. */
function one<T>(rows: T[] | null): T {
  const row = rows?.[0];
  if (!row) throw new DbError("NOT_FOUND");
  return row;
}

// --------------------------------------------------------------- workspace
export async function renameWorkspace(client: DbClient, workspaceId: string, name: string) {
  return one(
    check(
      await client.from("workspaces").update({ name }).eq("id", workspaceId).select("id, name"),
    ),
  );
}

export async function getWorkspace(client: DbClient, workspaceId: string) {
  return check(
    await client
      .from("workspaces")
      .select("id, name, created_at")
      .eq("id", workspaceId)
      .maybeSingle(),
  );
}

export async function getMemberRole(
  client: DbClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const row = check(
    await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return row?.role ?? null;
}

export async function listMemberDirectory(client: DbClient, workspaceId: string) {
  return (
    check(await client.rpc("workspace_member_directory", { p_workspace_id: workspaceId })) ?? []
  );
}

export async function updateMemberRole(
  client: DbClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  return one(
    check(
      await client
        .from("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .select("user_id, role"),
    ),
  );
}

export async function removeMember(client: DbClient, workspaceId: string, userId: string) {
  one(
    check(
      await client
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .select("user_id"),
    ),
  );
}

export async function getSettings(client: DbClient, workspaceId: string) {
  return check(
    await client
      .from("workspace_settings")
      .select("research_preferences, ai_preferences, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  );
}

export async function updateSettings(
  client: DbClient,
  workspaceId: string,
  userId: string,
  patch: { research_preferences?: JsonValue; ai_preferences?: JsonValue },
) {
  return one(
    check(
      await client
        .from("workspace_settings")
        .update({ ...patch, updated_by: userId })
        .eq("workspace_id", workspaceId)
        .select("research_preferences, ai_preferences, updated_at"),
    ),
  );
}

// --------------------------------------------------------------- product states
export async function getProductState(client: DbClient, workspaceId: string, productId: string) {
  return check(
    await client
      .from("workspace_product_states")
      .select("status, is_favorite, is_hidden, personal_notes, last_viewed_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("product_id", productId)
      .maybeSingle(),
  );
}

export interface ProductStatePatchRow {
  status?: OpportunityStatus;
  is_favorite?: boolean;
  is_hidden?: boolean;
  personal_notes?: string | null;
  last_viewed_at?: string;
}

/** Insert-or-update of the per-workspace product state (member+). */
export async function upsertProductState(
  client: DbClient,
  workspaceId: string,
  productId: string,
  userId: string,
  patch: ProductStatePatchRow,
) {
  const existing = await getProductState(client, workspaceId, productId);
  if (existing) {
    return one(
      check(
        await client
          .from("workspace_product_states")
          .update({ ...patch, updated_by: userId })
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId)
          .select("status, is_favorite, is_hidden, personal_notes, last_viewed_at, updated_at"),
      ),
    );
  }
  return one(
    check(
      await client
        .from("workspace_product_states")
        .insert({ workspace_id: workspaceId, product_id: productId, updated_by: userId, ...patch })
        .select("status, is_favorite, is_hidden, personal_notes, last_viewed_at, updated_at"),
    ),
  );
}

export async function listFavorites(client: DbClient, workspaceId: string) {
  return (
    check(
      await client
        .from("workspace_product_states")
        .select("product_id, status, updated_at, saas_products(id, slug, name, tagline, logo_url)")
        .eq("workspace_id", workspaceId)
        .eq("is_favorite", true)
        .order("updated_at", { ascending: false }),
    ) ?? []
  );
}

export async function listHidden(client: DbClient, workspaceId: string) {
  return (
    check(
      await client
        .from("workspace_product_states")
        .select("product_id, updated_at, saas_products(id, slug, name, tagline, logo_url)")
        .eq("workspace_id", workspaceId)
        .eq("is_hidden", true)
        .order("updated_at", { ascending: false }),
    ) ?? []
  );
}

// --------------------------------------------------------------- collections
export async function listCollections(client: DbClient, workspaceId: string) {
  return (
    check(
      await client
        .from("collections")
        .select(
          "id, name, description, created_by, created_at, updated_at, collection_items(id, product_id, notes, added_at, saas_products(id, slug, name, tagline, logo_url))",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
    ) ?? []
  );
}

export async function createCollection(
  client: DbClient,
  workspaceId: string,
  userId: string,
  input: { name: string; description: string | null },
) {
  return one(
    check(
      await client
        .from("collections")
        .insert({ workspace_id: workspaceId, created_by: userId, ...input })
        .select("id, name, description, created_at"),
    ),
  );
}

export async function updateCollection(
  client: DbClient,
  workspaceId: string,
  id: string,
  patch: { name?: string; description?: string | null },
) {
  return one(
    check(
      await client
        .from("collections")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id, name, description, updated_at"),
    ),
  );
}

export async function deleteCollection(client: DbClient, workspaceId: string, id: string) {
  one(
    check(
      await client
        .from("collections")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id"),
    ),
  );
}

export async function addCollectionItem(
  client: DbClient,
  workspaceId: string,
  collectionId: string,
  userId: string,
  input: { product_id: string; notes: string | null },
) {
  return one(
    check(
      await client
        .from("collection_items")
        .insert({
          workspace_id: workspaceId,
          collection_id: collectionId,
          added_by: userId,
          ...input,
        })
        .select("id, product_id, notes, added_at"),
    ),
  );
}

export async function updateCollectionItem(
  client: DbClient,
  workspaceId: string,
  collectionId: string,
  itemId: string,
  notes: string | null,
) {
  return one(
    check(
      await client
        .from("collection_items")
        .update({ notes })
        .eq("workspace_id", workspaceId)
        .eq("collection_id", collectionId)
        .eq("id", itemId)
        .select("id, notes"),
    ),
  );
}

export async function deleteCollectionItem(
  client: DbClient,
  workspaceId: string,
  collectionId: string,
  itemId: string,
) {
  one(
    check(
      await client
        .from("collection_items")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("collection_id", collectionId)
        .eq("id", itemId)
        .select("id"),
    ),
  );
}

// --------------------------------------------------------------- saved searches
const SAVED_SEARCH_COLUMNS =
  "id, name, kind, search_text, filters, sort_key, is_pinned, created_by, created_at, updated_at";
export type SavedSearchRow = Pick<
  Tables["saved_searches"]["Row"],
  | "id"
  | "name"
  | "kind"
  | "search_text"
  | "filters"
  | "sort_key"
  | "is_pinned"
  | "created_by"
  | "created_at"
  | "updated_at"
>;

export async function listSavedSearches(
  client: DbClient,
  workspaceId: string,
): Promise<SavedSearchRow[]> {
  return (
    check(
      await client
        .from("saved_searches")
        .select(SAVED_SEARCH_COLUMNS)
        .eq("workspace_id", workspaceId)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
    ) ?? []
  );
}

export async function getSavedSearch(
  client: DbClient,
  workspaceId: string,
  id: string,
): Promise<SavedSearchRow | null> {
  return check(
    await client
      .from("saved_searches")
      .select(SAVED_SEARCH_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle(),
  );
}

export async function createSavedSearch(
  client: DbClient,
  workspaceId: string,
  userId: string,
  input: {
    name: string;
    kind: string;
    search_text: string | null;
    filters: JsonValue;
    sort_key: string;
    is_pinned: boolean;
  },
): Promise<SavedSearchRow> {
  return one(
    check(
      await client
        .from("saved_searches")
        .insert({ workspace_id: workspaceId, created_by: userId, ...input })
        .select(SAVED_SEARCH_COLUMNS),
    ),
  );
}

export async function updateSavedSearch(
  client: DbClient,
  workspaceId: string,
  id: string,
  patch: {
    name?: string;
    search_text?: string | null;
    filters?: JsonValue;
    sort_key?: string;
    is_pinned?: boolean;
  },
): Promise<SavedSearchRow> {
  return one(
    check(
      await client
        .from("saved_searches")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select(SAVED_SEARCH_COLUMNS),
    ),
  );
}

export async function deleteSavedSearch(client: DbClient, workspaceId: string, id: string) {
  one(
    check(
      await client
        .from("saved_searches")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id"),
    ),
  );
}

// --------------------------------------------------------------- tags
export async function listTags(client: DbClient, workspaceId: string) {
  return (
    check(
      await client
        .from("tags")
        .select("id, name, color, created_at, tag_assignments(id, product_id)")
        .eq("workspace_id", workspaceId)
        .order("name"),
    ) ?? []
  );
}

export async function createTag(
  client: DbClient,
  workspaceId: string,
  userId: string,
  input: { name: string; color: string | null },
) {
  return one(
    check(
      await client
        .from("tags")
        .insert({ workspace_id: workspaceId, created_by: userId, ...input })
        .select("id, name, color"),
    ),
  );
}

export async function updateTag(
  client: DbClient,
  workspaceId: string,
  id: string,
  patch: { name?: string; color?: string | null },
) {
  return one(
    check(
      await client
        .from("tags")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id, name, color"),
    ),
  );
}

export async function deleteTag(client: DbClient, workspaceId: string, id: string) {
  one(
    check(
      await client.from("tags").delete().eq("workspace_id", workspaceId).eq("id", id).select("id"),
    ),
  );
}

export async function assignTag(
  client: DbClient,
  workspaceId: string,
  tagId: string,
  productId: string,
  userId: string,
) {
  return one(
    check(
      await client
        .from("tag_assignments")
        .insert({
          workspace_id: workspaceId,
          tag_id: tagId,
          product_id: productId,
          assigned_by: userId,
        })
        .select("id, tag_id, product_id"),
    ),
  );
}

export async function unassignTag(
  client: DbClient,
  workspaceId: string,
  tagId: string,
  productId: string,
) {
  one(
    check(
      await client
        .from("tag_assignments")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("tag_id", tagId)
        .eq("product_id", productId)
        .select("id"),
    ),
  );
}

export async function listProductTags(client: DbClient, workspaceId: string, productId: string) {
  return (
    check(
      await client
        .from("tag_assignments")
        .select("tag_id, tags(id, name, color)")
        .eq("workspace_id", workspaceId)
        .eq("product_id", productId),
    ) ?? []
  );
}

export async function listProductCollections(
  client: DbClient,
  workspaceId: string,
  productId: string,
) {
  return (
    check(
      await client
        .from("collection_items")
        .select("id, collection_id, notes, collections(id, name)")
        .eq("workspace_id", workspaceId)
        .eq("product_id", productId),
    ) ?? []
  );
}

// --------------------------------------------------------------- correction reports
export async function createCorrectionReport(
  client: DbClient,
  workspaceId: string,
  productId: string,
  userId: string,
  input: { report_type: string; field_key: string | null; message: string },
) {
  // `id` is not readable before insert under the column grant; select it back.
  return one(
    check(
      await client
        .from("catalog_correction_reports")
        .insert({ workspace_id: workspaceId, product_id: productId, reported_by: userId, ...input })
        .select("id, status, created_at"),
    ),
  );
}

export async function listWorkspaceReports(client: DbClient, workspaceId: string) {
  return (
    check(
      await client
        .from("catalog_correction_reports")
        .select(
          "id, product_id, report_type, field_key, message, status, resolution_note, created_at, resolved_at, saas_products(slug, name)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100),
    ) ?? []
  );
}
