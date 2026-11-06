// Refused job requests (S7.2): safe French message, limit kind, Retry-After.
import { describe, expect, it } from "vitest";
import { mapPostgresError } from "@sor/database";
import { limitResponse } from "@/lib/api/limits";

describe("limitResponse", () => {
  it("explains a rate-limited job request and when to retry", () => {
    const err = mapPostgresError({
      code: "54000",
      message: "RATE_LIMITED: job posts retry_after=90",
    });
    expect(err.code).toBe("RATE_LIMITED");
    expect(limitResponse(err)).toEqual({
      message: "Trop de demandes de traitement en une heure : réessayez plus tard.",
      details: { limit: "job_posts", retry_after_seconds: 90 },
      retryAfter: 90,
    });
  });

  it("explains the daily workspace quota", () => {
    const err = mapPostgresError({
      code: "54000",
      message: "LIMIT_EXCEEDED: daily jobs retry_after=3600",
    });
    expect(limitResponse(err)).toMatchObject({
      details: { limit: "daily_jobs", retry_after_seconds: 3600 },
      retryAfter: 3600,
    });
  });

  it("adds nothing for a limit it does not know", () => {
    const err = mapPostgresError({ code: "54000", message: "LIMIT_EXCEEDED: something" });
    expect(limitResponse(err)).toEqual({});
  });
});
