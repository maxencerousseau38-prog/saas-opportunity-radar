import { describe, expect, it } from "vitest";
import { JobError, backoffSeconds, budgetBlock, classifyError, classifyHttpStatus } from "../jobs";

describe("retry classification (§11)", () => {
  it("treats 408, 429 and 5xx as transient, other 4xx as permanent", () => {
    expect(classifyHttpStatus(408)).toBe("transient");
    expect(classifyHttpStatus(429)).toBe("transient");
    expect(classifyHttpStatus(503)).toBe("transient");
    expect(classifyHttpStatus(404)).toBe("permanent");
    expect(classifyHttpStatus(403)).toBe("permanent");
  });

  it("classifies typed job errors and known codes", () => {
    expect(classifyError(new JobError("budget", "BUDGET", "cost")).class).toBe("budget");
    expect(classifyError({ code: "EXCLUDED_SUBJECT", message: "x" })).toMatchObject({
      class: "permanent",
      retryable: false,
    });
    expect(classifyError({ code: "UNKNOWN_CITED_ID" }).retryable).toBe(false);
    expect(classifyError({ status: 502, message: "bad gateway" })).toMatchObject({
      code: "HTTP_502",
      retryable: true,
    });
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(classifyError(timeout)).toMatchObject({ class: "transient", code: "TIMEOUT" });
  });

  it("retries unknown errors (bounded by max_attempts) and truncates messages", () => {
    const c = classifyError(new Error("x".repeat(2000)));
    expect(c.retryable).toBe(true);
    expect(c.message).toHaveLength(500);
  });
});

describe("backoff with jitter", () => {
  it("grows exponentially and is capped", () => {
    const none = () => 0;
    expect(backoffSeconds(1, { random: none })).toBe(5);
    expect(backoffSeconds(2, { random: none })).toBe(10);
    expect(backoffSeconds(4, { random: none })).toBe(40);
    expect(backoffSeconds(30, { random: none })).toBe(600);
  });

  it("adds a bounded jitter", () => {
    const value = backoffSeconds(3, { random: () => 0.999 });
    expect(value).toBeGreaterThan(20);
    expect(value).toBeLessThanOrEqual(25);
  });
});

describe("budgets", () => {
  const budget = {
    maxCostUsd: 0,
    spentCostUsd: 0,
    maxExternalRequests: 5,
    externalRequestsUsed: 4,
    deadlineAt: "2026-11-05T00:00:00Z",
  };
  const now = new Date("2026-11-04T12:00:00Z");

  it("allows free work within the limits", () => {
    expect(budgetBlock(budget, { externalRequests: 1, costUsd: 0 }, now)).toBeNull();
  });

  it("refuses the request beyond the limit, any paid call at a zero budget, and work after the deadline", () => {
    expect(budgetBlock(budget, { externalRequests: 2 }, now)).toBe("requests");
    expect(budgetBlock(budget, { costUsd: 0.01 }, now)).toBe("cost");
    expect(budgetBlock(budget, {}, new Date("2026-11-05T00:00:01Z"))).toBe("time");
  });
});
