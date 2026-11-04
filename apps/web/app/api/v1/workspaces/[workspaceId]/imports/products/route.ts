import { z } from "zod";
import { idempotencyKey, parseBody, workspaceRoute } from "@/lib/api/http";
import { accepted, createJob, roughRowCount } from "@/lib/services/jobs";

const Body = z
  .object({
    csv: z.string().min(1).max(2_000_000),
    filename: z.string().max(200).nullable().default(null),
  })
  .strict();

/** CSV product import (PRD §18): rows are validated by the worker, results per row. */
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, Body, { maxBytes: 2_100_000 });
  const { jobId, created } = await createJob({
    kind: "catalog_import",
    workspaceId,
    userId: user.id,
    idempotencyKey: key,
    payload: { csv: body.csv, filename: body.filename, row_count: roughRowCount(body.csv) },
  });
  return accepted(workspaceId, jobId, created);
});
