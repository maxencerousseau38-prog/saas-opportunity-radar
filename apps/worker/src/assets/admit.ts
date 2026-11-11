// Admission and revalidation of product visuals (ADR-016, PD-36; S8.3).
// Rights first: nothing is downloaded unless the documented rights cover a
// private copy. Then the image is fetched through the SSRF-safe fetcher,
// checked from its bytes (format, size, shape) and stored privately through
// an audited RPC. No source, connector or crawl: one operator-named image at
// a time.
import { createHash } from "node:crypto";
import type { ConnectorOutcome, FetchedImage } from "@sor/data-sources";
import type { VisualAssetManifest } from "@sor/contracts";
import { discoverAssetsRepo, type DbClient } from "@sor/database";
import { checkVisualAssetBytes, checkVisualAssetRights } from "@sor/domain";

export type FetchImage = (url: string) => Promise<ConnectorOutcome<FetchedImage>>;

export interface AdmissionResult {
  product_slug: string;
  image_url: string;
  status: "created" | "existing" | "refused";
  reasons: string[];
  asset_id?: string;
}

export async function admitAssets(
  db: DbClient,
  manifest: VisualAssetManifest,
  opts: { operator: string; fetchImage: FetchImage; log?: (line: string) => void },
): Promise<AdmissionResult[]> {
  const results: AdmissionResult[] = [];
  for (const entry of manifest.assets) {
    const base = { product_slug: entry.product_slug, image_url: entry.image_url };
    const refuse = (reasons: string[]) => {
      results.push({ ...base, status: "refused", reasons });
      opts.log?.(`refused ${entry.product_slug} ${entry.image_url}: ${reasons.join(", ")}`);
    };
    const rights = checkVisualAssetRights({
      assetType: entry.asset_type,
      rights: {
        status: entry.rights.status,
        basis: entry.rights.basis,
        evidenceUrl: entry.rights.evidence_url,
        coversPrivateCopy: entry.rights.covers_private_copy,
      },
    });
    if (rights.length) {
      refuse(rights); // nothing downloaded
      continue;
    }
    const productId = await discoverAssetsRepo.productIdBySlug(db, entry.product_slug);
    if (!productId) {
      refuse(["unknown_product"]);
      continue;
    }
    const fetched = await opts.fetchImage(entry.image_url);
    if (fetched.status !== "ok") {
      refuse([`fetch_${fetched.status}:${fetched.reason}`]);
      continue;
    }
    const check = checkVisualAssetBytes(
      entry.asset_type,
      fetched.data.bytes,
      fetched.data.contentType,
    );
    if (!check.ok) {
      refuse(check.errors);
      continue;
    }
    const admitted = await discoverAssetsRepo.admitVisualAsset(db, {
      operator: opts.operator,
      productId,
      content: fetched.data.bytes,
      asset: {
        asset_type: entry.asset_type,
        image_url: entry.image_url,
        page_url: entry.page_url,
        alt_text: entry.alt_text,
        rights_basis: entry.rights.basis,
        rights_evidence_url: entry.rights.evidence_url,
        covers_private_copy: entry.rights.covers_private_copy,
        content_type: check.info.contentType,
        width: check.info.width,
        height: check.info.height,
        primary: entry.primary,
        ...(entry.observed_at ? { observed_at: `${entry.observed_at}T00:00:00Z` } : {}),
      },
    });
    results.push({ ...base, status: admitted.status, reasons: [], asset_id: admitted.asset_id });
    opts.log?.(`${admitted.status} ${entry.product_slug} ${admitted.asset_id}`);
  }
  return results;
}

export interface RevalidationResult {
  asset_id: string;
  result: "unchanged" | "changed" | "unavailable" | "refused" | "skipped_transient";
  reason?: string;
}

/**
 * Re-downloads every displayable visual: unchanged bytes keep it; a changed,
 * missing or refused source hides it and deletes its copy (the operator
 * re-admits a new visual if its rights still hold). A transient error changes
 * nothing.
 */
export async function revalidateAssets(
  db: DbClient,
  opts: { fetchImage: FetchImage; log?: (line: string) => void },
): Promise<RevalidationResult[]> {
  const out: RevalidationResult[] = [];
  for (const asset of await discoverAssetsRepo.listCurrentVisualAssets(db)) {
    const fetched = await opts.fetchImage(asset.source_url);
    if (fetched.status !== "ok") {
      if (fetched.retryable) {
        out.push({ asset_id: asset.id, result: "skipped_transient", reason: fetched.reason });
        continue;
      }
      const result = fetched.status === "unavailable" ? "unavailable" : "refused";
      await discoverAssetsRepo.recordVisualAssetCheck(db, { assetId: asset.id, result });
      out.push({ asset_id: asset.id, result, reason: fetched.reason });
      continue;
    }
    const hash = createHash("sha256").update(fetched.data.bytes).digest("hex");
    const result = (await discoverAssetsRepo.recordVisualAssetCheck(db, {
      assetId: asset.id,
      result: "unchanged",
      contentHash: hash,
    })) as RevalidationResult["result"];
    out.push({ asset_id: asset.id, result });
    opts.log?.(`${result} ${asset.id}`);
  }
  return out;
}
