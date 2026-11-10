import { ExternalResearchSectionSchema, UUIDSchema } from "@sor/contracts";
import { AskAiWorkspace } from "@/components/ask-ai/workspace";
import { buildExternalResearchContext } from "@/lib/ask-ai/context";
import type { ExternalResearchSessionDetails } from "@/lib/ask-ai/types";
import { ApiError } from "@/lib/api/http";
import { getExternalResearch, listExternalResearch } from "@/lib/services/external-research";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

const ALL_OPTIONAL_SECTIONS = ExternalResearchSectionSchema.options;

export const metadata = { title: "Ask AI — SaaS Opportunity Radar" };

export default async function AskAiPage(props: PageProps<"/w/[workspaceId]/ask-ai">) {
  const { workspaceId } = await props.params;
  const { products: rawProducts, session: rawSession } = await props.searchParams;
  const { client, user, membership } = await requireWorkspace(workspaceId);
  const rawIds = typeof rawProducts === "string" ? rawProducts.split(",") : [];
  const validIds = rawIds.filter((id) => UUIDSchema.safeParse(id).success);
  const productIds = [...new Set(validIds)].slice(0, 5);
  const selectedSessionId =
    typeof rawSession === "string" && UUIDSchema.safeParse(rawSession).success ? rawSession : null;
  const [initialContext, initialSessions, initialSession] = await Promise.all([
    productIds.length
      ? buildExternalResearchContext(client, productIds, [...ALL_OPTIONAL_SECTIONS])
      : Promise.resolve(null),
    listExternalResearch(client, workspaceId),
    selectedSessionId
      ? getExternalResearch(client, workspaceId, selectedSessionId).catch((error: unknown) => {
          if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
          throw error;
        })
      : Promise.resolve(null),
  ]);

  return (
    <AskAiWorkspace
      key={selectedSessionId ?? (productIds.length ? productIds.join(",") : "empty")}
      workspaceId={workspaceId}
      userId={user.id}
      canEdit={canEdit(membership.role)}
      canAdmin={canAdmin(membership.role)}
      initialContext={initialContext}
      initialSession={initialSession as ExternalResearchSessionDetails | null}
      initialSessions={initialSessions}
    />
  );
}
