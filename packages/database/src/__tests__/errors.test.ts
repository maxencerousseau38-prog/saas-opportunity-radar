import { describe, expect, it } from "vitest";
import { DbError, mapPostgresError } from "../errors";

describe("mapPostgresError", () => {
  it.each([
    ["22023", "VALIDATION_ERROR"],
    ["23503", "VALIDATION_ERROR"],
    ["23505", "INVALID_STATE"],
    ["28000", "UNAUTHENTICATED"],
    ["42501", "FORBIDDEN"],
    ["54000", "LIMIT_EXCEEDED"],
    ["PGRST116", "NOT_FOUND"],
    ["XX000", "INTERNAL_ERROR"],
    [undefined, "INTERNAL_ERROR"],
  ])("maps %s to %s", (code, expected) => {
    expect(mapPostgresError({ code, message: "x" }).code).toBe(expected);
  });

  it("recognises integrity-trigger violations", () => {
    expect(mapPostgresError({ code: "23514", message: "EVIDENCE_SCOPE_VIOLATION: x" }).code).toBe(
      "EVIDENCE_SCOPE_VIOLATION",
    );
    expect(mapPostgresError({ code: "23514", message: "EXCLUDED_CATEGORY: x" }).code).toBe(
      "EXCLUDED_SUBJECT",
    );
    expect(mapPostgresError({ code: "23514", message: "other check" }).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("never exposes the database message publicly", () => {
    const raw = { code: "42501", message: 'permission denied for table "audit_logs"' };
    const error = mapPostgresError(raw);
    expect(error).toBeInstanceOf(DbError);
    expect(error.message).toBe("Not allowed");
    expect(error.message).not.toContain("audit_logs");
    expect(error.cause).toBe(raw);
  });
});
