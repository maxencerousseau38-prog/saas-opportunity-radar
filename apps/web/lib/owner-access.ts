// Personal owner access (PD-39). The product owner opens /auth/acces#<secret>
// and is signed into their own account without a password. The secret lives
// only in the server environment (OWNER_ACCESS_TOKEN); the fragment never
// reaches server logs. Comparison is constant-time on SHA-256 digests.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** True only when a secret is configured and the candidate equals it exactly. */
export function ownerSecretMatches(candidate: unknown, configured: string | undefined): boolean {
  if (!configured || typeof candidate !== "string") return false;
  if (candidate.length === 0 || candidate.length > 256) return false;
  return timingSafeEqual(digest(candidate), digest(configured));
}
