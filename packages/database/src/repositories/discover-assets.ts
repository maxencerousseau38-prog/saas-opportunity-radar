// S8.3 Discover V2 completion (ADR-016, ADR-017): server-role access to
// operator-recorded Acquisition Channels and to admitted product visuals.
// Callers authenticate the operator first; the RPCs re-check it.
import type { DbClient } from "../clients";
import { DbError, mapPostgresError } from "../errors";
import type { Json } from "../generated";

export interface ChannelClaimRow {
  channel_key: string;
  channel_category: string;
  role: "primary" | "secondary";
  status: "confirmed" | "declared" | "estimated";
  evidence_kind: "official_statement" | "third_party_report" | "inference";
  verified: boolean;
  source_url: string;
  excerpt: string;
  observed_at: string;
  rationale?: string;
  role_rationale?: string;
  confidence: number;
  confidence_method: string;
  confidence_reasons: string[];
}

export async function recordAcquisitionChannel(
  service: DbClient,
  args: { operator: string; productId: string; claim: ChannelClaimRow },
): Promise<string> {
  const { data, error } = await service.rpc("sor_operator_record_acquisition_channel", {
    p_operator: args.operator,
    p_product_id: args.productId,
    p_claim: args.claim as unknown as Json,
  });
  if (error) throw mapPostgresError(error);
  return data as string;
}

export async function retractAcquisitionChannel(
  service: DbClient,
  args: { operator: string; channelId: string; reason: string },
): Promise<void> {
  const { error } = await service.rpc("sor_operator_retract_acquisition_channel", {
    p_operator: args.operator,
    p_channel_id: args.channelId,
    p_reason: args.reason,
  });
  if (error) throw mapPostgresError(error);
}

/** Current operator-visible channels, newest first, with their product. */
export async function listAcquisitionChannels(service: DbClient, limit = 100) {
  const { data, error } = await service
    .from("product_acquisition_channels")
    .select(
      "id, channel_key, channel_category, role, fact_status, confidence, confidence_reasons, observed_at, created_at, role_rationale, inference_rationale, saas_products(name, slug), evidence_items(claim_text, source_snapshots(source_records(canonical_url)))",
    )
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapPostgresError(error);
  return (data ?? []).map((r) => {
    const product = r.saas_products as unknown as { name: string; slug: string } | null;
    const evidence = r.evidence_items as unknown as {
      claim_text: string;
      source_snapshots: { source_records: { canonical_url: string } | null } | null;
    } | null;
    return {
      id: r.id,
      product_name: product?.name ?? null,
      product_slug: product?.slug ?? null,
      channel_key: r.channel_key,
      channel_category: r.channel_category,
      role: r.role,
      status: r.fact_status,
      confidence: r.confidence,
      confidence_reasons: Array.isArray(r.confidence_reasons)
        ? (r.confidence_reasons as unknown[]).map(String)
        : [],
      observed_at: r.observed_at,
      excerpt: evidence?.claim_text ?? null,
      source_url: evidence?.source_snapshots?.source_records?.canonical_url ?? null,
      role_rationale: r.role_rationale,
      inference_rationale: r.inference_rationale,
    };
  });
}

/** Every admitted visual (any status), newest first, for the operator console. */
export async function listVisualAssets(service: DbClient, limit = 100) {
  const { data, error } = await service
    .from("product_visual_assets")
    .select(
      "id, asset_type, source_url, delivery_path, rights_basis, rights_status, rights_evidence_url, verification_status, is_current, is_primary, width, height, observed_at, created_at, removed_at, removal_reason, last_checked_at, last_check_status, saas_products(name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapPostgresError(error);
  return (data ?? []).map((r) => {
    const product = r.saas_products as unknown as { name: string; slug: string } | null;
    const rest: Omit<typeof r, "saas_products"> & { saas_products?: unknown } = { ...r };
    delete rest.saas_products;
    return { ...rest, product_name: product?.name ?? null, product_slug: product?.slug ?? null };
  });
}

export async function removeVisualAsset(
  service: DbClient,
  args: { operator: string; assetId: string; reason: string },
): Promise<void> {
  const { error } = await service.rpc("sor_operator_remove_visual_asset", {
    p_operator: args.operator,
    p_asset_id: args.assetId,
    p_reason: args.reason,
  });
  if (error) throw mapPostgresError(error);
}

/** PostgREST returns bytea as "\x<hex>". */
export function byteaToBuffer(value: unknown): Buffer {
  if (typeof value !== "string" || !value.startsWith("\\x")) {
    throw new DbError("INTERNAL_ERROR", "unexpected bytea encoding");
  }
  return Buffer.from(value.slice(2), "hex");
}

export function bufferToBytea(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes).toString("hex")}`;
}

/** Private copy of an asset (server role; the caller checked the user's access). */
export async function getVisualAssetFile(
  service: DbClient,
  assetId: string,
): Promise<{ contentType: string; bytes: Buffer } | null> {
  const { data, error } = await service
    .from("product_visual_asset_files")
    .select("content_type, content")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) return null;
  return { contentType: data.content_type, bytes: byteaToBuffer(data.content) };
}

// ------------------------------------------------------------ worker side

export async function admitVisualAsset(
  service: DbClient,
  args: {
    operator: string;
    productId: string;
    asset: Record<string, unknown>;
    content: Uint8Array;
  },
): Promise<{ asset_id: string; status: "created" | "existing" }> {
  const { data, error } = await service.rpc("sor_admit_visual_asset", {
    p_operator: args.operator,
    p_product_id: args.productId,
    p_asset: args.asset as Json,
    p_content: bufferToBytea(args.content),
  });
  if (error) throw mapPostgresError(error);
  return data as unknown as { asset_id: string; status: "created" | "existing" };
}

export async function listCurrentVisualAssets(service: DbClient) {
  const { data, error } = await service
    .from("product_visual_assets")
    .select("id, source_url, content_hash, asset_type")
    .eq("is_current", true)
    .order("created_at", { ascending: true });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function recordVisualAssetCheck(
  service: DbClient,
  args: {
    assetId: string;
    result: "unchanged" | "changed" | "unavailable" | "refused";
    contentHash?: string;
  },
): Promise<string> {
  const { data, error } = await service.rpc("sor_record_visual_asset_check", {
    p_asset_id: args.assetId,
    p_result: args.result,
    ...(args.contentHash ? { p_content_hash: args.contentHash } : {}),
  });
  if (error) throw mapPostgresError(error);
  return data as string;
}

export async function productIdBySlug(service: DbClient, slug: string): Promise<string | null> {
  const { data, error } = await service
    .from("saas_products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  return data?.id ?? null;
}

// ------------------------------------------------------------ S8.5 references

/** Records one visual displayed by reference (PD-38); returns its status. */
export async function recordVisualReference(
  service: DbClient,
  reference: Record<string, unknown>,
): Promise<{ status: string; asset_id?: string; product_id?: string; primary?: boolean }> {
  const { data, error } = await service.rpc("sor_record_visual_reference", {
    p_ref: reference as Json,
  });
  if (error) throw mapPostgresError(error);
  return data as unknown as {
    status: string;
    asset_id?: string;
    product_id?: string;
    primary?: boolean;
  };
}
