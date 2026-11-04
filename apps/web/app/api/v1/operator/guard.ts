import "server-only";
import { ApiError } from "@/lib/api/http";
import { isOperator } from "@/lib/auth";

/** Platform operator only (ADR-007, PD-12 A). Others get 404. */
export async function requireOperator(userId: string): Promise<void> {
  if (!(await isOperator(userId))) throw new ApiError("NOT_FOUND");
}
