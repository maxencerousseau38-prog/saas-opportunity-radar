import { z } from "zod";
import { FeedbackImportRequestSchema } from "@sor/contracts";
import { idempotencyKey, parseBody, workspaceRoute } from "@/lib/api/http";
import { accepted, createJob, roughRowCount } from "@/lib/services/jobs";

const Body = FeedbackImportRequestSchema.extend({
  csv: z.string().min(1).max(2_000_000),
  filename: z.string().max(200).nullable().default(null),
}).strict();

/** CSV feedback import with a rights declaration that drives what is stored (ADR-013). */
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, Body, { maxBytes: 2_100_000 });
  const { jobId, created } = await createJob({
    kind: "feedback_import",
    workspaceId,
    userId: user.id,
    idempotencyKey: key,
    payload: {
      csv: body.csv,
      filename: body.filename,
      row_count: roughRowCount(body.csv),
      rights_declaration: body.rights_declaration,
    },
  });
  return accepted(workspaceId, jobId, created);
});
