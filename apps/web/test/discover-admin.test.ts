// S8.3: an operator's channel claim is normalized against the registry,
// checked against the status rules and scored deterministically.
import { describe, expect, it } from "vitest";
import { buildChannelClaim } from "@/lib/services/discover-admin";

const body = {
  product_slug: "metricflow",
  channel: "Twitter",
  role: "secondary" as const,
  status: "declared" as const,
  evidence_kind: "official_statement" as const,
  verified: true,
  direct_excerpt: true,
  source_url: "https://metricflow.test/blog",
  excerpt: "Most signups come from our posts on X",
  observed_at: "2026-11-01",
};
const now = new Date("2026-11-11T12:00:00Z");

describe("buildChannelClaim", () => {
  it("normalizes the channel and computes the confidence with its reasons", () => {
    const claim = buildChannelClaim(body, now);
    expect(claim).toMatchObject({
      channel_key: "x",
      channel_category: "social",
      confidence: 70,
      confidence_method: "chanconf-1",
      observed_at: "2026-11-01T00:00:00.000Z",
    });
    expect(claim.confidence_reasons.length).toBeGreaterThan(0);
  });

  it("refuses a channel outside the registry", () => {
    expect(() => buildChannelClaim({ ...body, channel: "growth magic" }, now)).toThrow(/registre/);
  });

  it("explains a refused rule in French", () => {
    expect(() => buildChannelClaim({ ...body, role: "primary" }, now)).toThrow(/principal/);
    expect(() => buildChannelClaim({ ...body, status: "confirmed", verified: false }, now)).toThrow(
      /source vérifiée/,
    );
  });
});
