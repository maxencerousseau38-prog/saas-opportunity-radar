// Implementation Blueprint §4.2 — catalog contracts.
// Sprint 0 ships only the CSV cell helpers; the catalog schemas arrive in Sprint 2.
import { z } from "zod";

const emptyToNull = (v: unknown): unknown =>
  v === "" || v === null || v === undefined ? null : Number(v);

/** CSV cell: an empty cell is unknown (null), never 0. */
export const CsvNullableInt = z.preprocess(emptyToNull, z.number().int().min(0).nullable());

/** CSV cell: an empty cell is unknown (null), never 0. */
export const CsvNullableNumber = z.preprocess(emptyToNull, z.number().min(0).nullable());
