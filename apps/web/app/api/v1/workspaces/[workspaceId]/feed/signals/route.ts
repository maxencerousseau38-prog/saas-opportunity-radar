import { FeedSignalsRequestSchema } from "@sor/contracts";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { recordFeedSignals } from "@/lib/services/catalog";

// Discover feed signals (PD-41): cards shown and profiles opened in one feed
// session. Member and above, like profile views; nothing is returned (204).
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const body = await parseBody(request, FeedSignalsRequestSchema, { maxBytes: 8_000 });
  await recordFeedSignals(workspaceId, user.id, body);
});
