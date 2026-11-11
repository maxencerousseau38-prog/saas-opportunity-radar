// S8.3 operator services (ADR-016, ADR-017): recording Acquisition Channels
// and managing admitted product visuals. The deterministic rules live in
// @sor/domain (registry chanreg-1, confidence chanconf-1); the RPCs check
// them again in the database.
import "server-only";
import type { OperatorChannelRecord } from "@sor/contracts";
import { discoverAssetsRepo, type DbClient } from "@sor/database";
import {
  channelConfidence,
  channelDefinition,
  normalizeChannelKey,
  validateChannelClaim,
  type ChannelClaimInput,
} from "@sor/domain";
import { ApiError } from "@/lib/api/http";

const CLAIM_ERRORS: Record<string, string> = {
  confirmed_requires_verified_source: "Un canal confirmé exige une source vérifiée.",
  confirmed_requires_direct_excerpt: "Un canal confirmé exige un extrait direct de la source.",
  confirmed_cannot_be_inference: "Une inférence ne peut pas être confirmée.",
  declared_cannot_be_inference:
    "Une déclaration doit provenir de l’entreprise ou d’un représentant.",
  estimated_requires_inference: "Un canal estimé repose sur une inférence explicite.",
  estimated_requires_rationale: "Une estimation doit expliquer sa méthode et ses indices.",
  primary_requires_primacy_evidence:
    "Un canal principal exige un extrait qui établit qu’il est principal.",
  observed_in_future: "La date d’observation ne peut pas être dans le futur.",
};

/** Normalized, validated claim with its deterministic confidence (pure). */
export function buildChannelClaim(body: OperatorChannelRecord, now = new Date()) {
  const key = normalizeChannelKey(body.channel);
  const definition = key ? channelDefinition(key) : null;
  if (!key || !definition) {
    throw new ApiError("VALIDATION_ERROR", "Canal inconnu du registre : ajoutez-le au registre", {
      channel: body.channel,
    });
  }
  const input: ChannelClaimInput = {
    status: body.status,
    evidenceKind: body.evidence_kind,
    role: body.role,
    verified: body.verified,
    directExcerpt: body.direct_excerpt,
    primacyExcerpt: body.role_rationale ?? null,
    rationale: body.rationale ?? null,
    observedAt: new Date(`${body.observed_at}T00:00:00Z`),
    now,
  };
  const errors = validateChannelClaim(input);
  if (errors.length) {
    throw new ApiError("VALIDATION_ERROR", errors.map((e) => CLAIM_ERRORS[e] ?? e).join(" "), {
      rules: errors,
    });
  }
  const confidence = channelConfidence(input);
  return {
    channel_key: key,
    channel_category: definition.category,
    role: body.role,
    status: body.status,
    evidence_kind: body.evidence_kind,
    verified: body.verified,
    source_url: body.source_url,
    excerpt: body.excerpt,
    observed_at: input.observedAt.toISOString(),
    ...(body.rationale ? { rationale: body.rationale } : {}),
    ...(body.role_rationale ? { role_rationale: body.role_rationale } : {}),
    confidence: confidence.score,
    confidence_method: confidence.method,
    confidence_reasons: confidence.reasons,
  };
}

export async function recordChannel(
  service: DbClient,
  operator: string,
  body: OperatorChannelRecord,
): Promise<{ id: string; channel_key: string; confidence: number }> {
  const claim = buildChannelClaim(body);
  const productId = await discoverAssetsRepo.productIdBySlug(service, body.product_slug);
  if (!productId) throw new ApiError("NOT_FOUND", "SaaS introuvable pour ce slug");
  const id = await discoverAssetsRepo.recordAcquisitionChannel(service, {
    operator,
    productId,
    claim,
  });
  return { id, channel_key: claim.channel_key, confidence: claim.confidence };
}
