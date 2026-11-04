import { describe, expect, it } from "vitest";
import {
  canonicalValue,
  detectConflicts,
  selectClaim,
  verifyClaim,
  type ClaimCandidate,
} from "../evidence";

const claim = (over: Partial<ClaimCandidate>): ClaimCandidate => ({
  fieldKey: "founded_year",
  value: 2019,
  verificationStatus: "verified",
  factStatus: "declared",
  reliabilityLevel: 1,
  observedAt: "2026-10-01T00:00:00Z",
  evidenceId: "e1",
  ...over,
});

describe("claim selection", () => {
  it("prefers verified, then more reliable, then newer; never rejected", () => {
    expect(
      selectClaim([
        claim({
          evidenceId: "a",
          verificationStatus: "unverified",
          observedAt: "2026-11-01T00:00:00Z",
        }),
        claim({ evidenceId: "b" }),
      ])?.evidenceId,
    ).toBe("b");
    expect(
      selectClaim([
        claim({ evidenceId: "a", reliabilityLevel: 4 }),
        claim({ evidenceId: "b", reliabilityLevel: 1 }),
      ])?.evidenceId,
    ).toBe("b");
    expect(
      selectClaim([
        claim({ evidenceId: "a" }),
        claim({ evidenceId: "b", observedAt: "2026-11-02T00:00:00Z" }),
      ])?.evidenceId,
    ).toBe("b");
    expect(selectClaim([claim({ verificationStatus: "rejected" })])).toBeNull();
  });

  it("an older unverified claim never replaces a newer verified fact", () => {
    const newerVerified = claim({ evidenceId: "new", observedAt: "2026-11-01T00:00:00Z" });
    const olderUnverified = claim({
      evidenceId: "old",
      verificationStatus: "unverified",
      observedAt: "2025-01-01T00:00:00Z",
    });
    expect(selectClaim([olderUnverified, newerVerified])?.evidenceId).toBe("new");
  });
});

describe("conflicts", () => {
  it("records different values on the same field, ignoring formatting", () => {
    expect(canonicalValue(" Paris ")).toBe(canonicalValue("paris"));
    expect(
      detectConflicts([
        claim({ evidenceId: "b", value: 2018 }),
        claim({ evidenceId: "a", value: 2019 }),
      ]),
    ).toEqual([{ a: "a", b: "b", fieldKey: "founded_year" }]);
    expect(detectConflicts([claim({ evidenceId: "a" }), claim({ evidenceId: "b" })])).toEqual([]);
    expect(
      detectConflicts([
        claim({ evidenceId: "a" }),
        claim({ evidenceId: "b", value: 2020, verificationStatus: "rejected" }),
      ]),
    ).toEqual([]);
  });
});

describe("deterministic verification (D6)", () => {
  const base = {
    claimType: "feature",
    monetizationSignal: null,
    reliabilityLevel: 1 as const,
    quote: "Real-time dashboards",
    snapshotText: "MetricFlow offers real-time   dashboards for agencies.",
    snapshotSuppliedToStep: true,
    publishedAt: null,
    retrievedAt: "2026-11-04T00:00:00Z",
    now: new Date("2026-11-04T12:00:00Z"),
    maxAgeDays: 365,
  };

  it("verifies a claim whose quote is in the cited snapshot", () => {
    expect(verifyClaim(base).status).toBe("verified");
  });

  it("rejects a quote that is not in the snapshot, or a snapshot not given to the step", () => {
    expect(verifyClaim({ ...base, quote: "AI forecasting" })).toMatchObject({
      status: "rejected",
      reasons: ["quote_not_in_snapshot"],
    });
    expect(verifyClaim({ ...base, snapshotSuppliedToStep: false }).status).toBe("rejected");
  });

  it("sends a claim without a quote to review", () => {
    expect(verifyClaim({ ...base, quote: null }).status).toBe("needs_review");
  });

  it("a pricing page is never payment proof", () => {
    const r = verifyClaim({
      ...base,
      claimType: "pricing",
      monetizationSignal: "payment_confirmed",
      quote: "dashboards",
    });
    expect(r.monetizationSignal).toBe("paid_plan_available");
  });

  it("community or inferred sources cannot confirm payment", () => {
    const r = verifyClaim({
      ...base,
      claimType: "paid_customer_signal",
      monetizationSignal: "customer_verified",
      reliabilityLevel: 3,
      quote: "dashboards",
    });
    expect(r.monetizationSignal).toBe("unknown");
  });

  it("marks old evidence stale", () => {
    expect(verifyClaim({ ...base, publishedAt: "2024-01-01T00:00:00Z" }).status).toBe("stale");
  });
});
