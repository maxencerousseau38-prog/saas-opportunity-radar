import { ExternalResearchSectionSchema, UUIDSchema } from "@sor/contracts";
import { AskAiWorkspace } from "@/components/ask-ai/workspace";
import { catalogRepo } from "@sor/database";
import {
  buildCategoryResearchContext,
  buildClusterResearchContext,
  buildExternalResearchContext,
} from "@/lib/ask-ai/context";
import type { ExternalResearchSessionDetails } from "@/lib/ask-ai/types";
import { ApiError } from "@/lib/api/http";
import { getExternalResearch, listExternalResearch } from "@/lib/services/external-research";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

const ALL_OPTIONAL_SECTIONS = ExternalResearchSectionSchema.options;

export const metadata = { title: "Ask AI — SaaS Opportunity Radar" };

export default async function AskAiPage(props: PageProps<"/w/[workspaceId]/ask-ai">) {
  const { workspaceId } = await props.params;
  const {
    products: rawProducts,
    session: rawSession,
    category: rawCategory,
    cluster: rawCluster,
  } = await props.searchParams;
  const { client, user, membership } = await requireWorkspace(workspaceId);
  const rawIds = typeof rawProducts === "string" ? rawProducts.split(",") : [];
  const validIds = rawIds.filter((id) => UUIDSchema.safeParse(id).success);
  const productIds = [...new Set(validIds)].slice(0, 5);
  const categorySlug =
    typeof rawCategory === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(rawCategory)
      ? rawCategory
      : null;
  const clusterId =
    typeof rawCluster === "string" && UUIDSchema.safeParse(rawCluster).success ? rawCluster : null;
  const sections = [...ALL_OPTIONAL_SECTIONS];
  // A missing or invisible subject shows the selection form instead of an error page.
  const notFound = (error: unknown) => {
    if (
      error instanceof ApiError &&
      (error.code === "NOT_FOUND" || error.code === "VALIDATION_ERROR")
    )
      return null;
    throw error;
  };
  const loadContext = () =>
    clusterId
      ? buildClusterResearchContext(client, workspaceId, clusterId, sections).catch(notFound)
      : categorySlug
        ? buildCategoryResearchContext(client, workspaceId, categorySlug, sections).catch(notFound)
        : productIds.length
          ? buildExternalResearchContext(client, productIds, sections)
          : Promise.resolve(null);
  const selectedSessionId =
    typeof rawSession === "string" && UUIDSchema.safeParse(rawSession).success ? rawSession : null;
  const [initialContext, initialSessions, initialSession, categories] = await Promise.all([
    loadContext(),
    listExternalResearch(client, workspaceId),
    selectedSessionId
      ? getExternalResearch(client, workspaceId, selectedSessionId).catch((error: unknown) => {
          if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
          throw error;
        })
      : Promise.resolve(null),
    catalogRepo.listCategories(client),
  ]);

  return (
    <AskAiWorkspace
      key={
        selectedSessionId ??
        clusterId ??
        categorySlug ??
        (productIds.length ? productIds.join(",") : "empty")
      }
      categories={categories
        .filter((category) => category.parent_id === null)
        .map((category) => ({ slug: category.slug, name: category.name }))}
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
