import { route } from "@/lib/api/http";
import { platformHealth } from "@/lib/services/ops";
import { requireOperator } from "../guard";

/** Platform health: queue, stuck and failed jobs, provider errors, AI cost, alerts (S7.3). */
export const GET = route(async ({ client, user }) => {
  await requireOperator({ client, user });
  return { data: await platformHealth() };
});
