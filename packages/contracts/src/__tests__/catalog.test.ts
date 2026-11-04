import { describe, expect, it } from "vitest";
import { CsvNullableInt, CsvNullableNumber } from "../catalog";

describe("CSV cell helpers (unknown is null, never 0)", () => {
  it.each(["", null, undefined])("maps %j to null", (cell) => {
    expect(CsvNullableInt.parse(cell)).toBeNull();
    expect(CsvNullableNumber.parse(cell)).toBeNull();
  });

  it("parses numbers", () => {
    expect(CsvNullableInt.parse("12")).toBe(12);
    expect(CsvNullableNumber.parse("4.5")).toBe(4.5);
  });

  it.each(["abc", "-1", "1.5"])("rejects invalid integer cell %j", (cell) => {
    expect(CsvNullableInt.safeParse(cell).success).toBe(false);
  });
});
