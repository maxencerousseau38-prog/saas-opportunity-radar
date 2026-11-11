// The D5/D6 contracts, prepared for each vendor's structured-output mode,
// keep only keywords that vendor accepts (evals/benchmark/vendor-docs):
// strict objects, every property required, no empty (untyped) schema.
import { describe, expect, it } from "vitest";
import { jsonSchemaFor, type SchemaDialect } from "@sor/ai-gateway";
import { EnrichmentOutputSchema, VerificationOutputSchema } from "@sor/contracts";

const REJECTED: Record<SchemaDialect, string[]> = {
  anthropic: [
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "maxItems",
  ],
  openai: ["minLength", "maxLength"],
  mistral: [
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "maxItems",
  ],
};

function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node as Record<string, unknown>);
  Object.values(node as Record<string, unknown>).forEach((v) => walk(v, visit));
}

describe("D5/D6 schemas per vendor", () => {
  for (const dialect of ["anthropic", "openai", "mistral"] as const) {
    it(`${dialect}: only accepted keywords, strict objects`, () => {
      for (const schema of [EnrichmentOutputSchema, VerificationOutputSchema]) {
        const json = jsonSchemaFor(schema, dialect);
        walk(json, (n) => {
          for (const k of REJECTED[dialect]) expect(n, k).not.toHaveProperty(k);
          if (n.type === "object" && n.properties) {
            expect(n.additionalProperties).toBe(false);
            expect(n.required).toEqual(Object.keys(n.properties as object));
          }
          if (typeof n.minItems === "number" && dialect !== "openai")
            expect(n.minItems).toBeLessThanOrEqual(1);
          if (dialect === "openai" && typeof n.format === "string")
            expect([
              "date-time",
              "time",
              "date",
              "duration",
              "email",
              "hostname",
              "ipv4",
              "ipv6",
              "uuid",
            ]).toContain(n.format);
        });
        expect(JSON.stringify(json)).not.toContain('"$schema"');
      }
    });
  }
});
