import { notFound } from "next/navigation";
import Link from "next/link";
import { serverRepo } from "@sor/database";
import { CatalogReviews } from "@/components/workspace/catalog-reviews";
import { OperatorMfa } from "@/components/workspace/operator-mfa";
import { OperatorView } from "@/components/workspace/operator-view";
import { PlatformHealth } from "@/components/workspace/platform-health";
import { getMemberships, operatorAccess, requireUser } from "@/lib/auth";
import { platformHealth } from "@/lib/services/ops";
import { getServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Opérateur — SaaS Opportunity Radar" };

/**
 * Platform operator console (ADR-007, PD-12 A): platform health (S7.3),
 * exclusion reviews, collected catalog listings to review (S8.2) and
 * correction reports.
 */
export default async function OperatorPage() {
  const { client, user } = await requireUser();
  const access = await operatorAccess(client, user.id);
  if (access === "none") notFound();
  if (access === "mfa_required") {
    // PD-30: an MFA-verified session (AAL2) is required; nothing is loaded before.
    const factors = await client.auth.mfa.listFactors();
    const verified = factors.data?.totp[0]?.id ?? null;
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold">Console opérateur</h1>
        <OperatorMfa factorId={verified} />
      </main>
    );
  }
  const service = getServiceClient();
  const [reviews, catalogReviews, reports, memberships, health] = await Promise.all([
    serverRepo.listExclusionReviews(service),
    serverRepo.listCatalogReviews(service),
    serverRepo.listCorrectionReports(service, "open"),
    getMemberships(user.id),
    platformHealth(),
  ]);
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Console opérateur</h1>
        {memberships[0] ? (
          <Link
            className="text-sm text-muted underline"
            href={`/w/${memberships[0].workspaceId}/discover`}
          >
            Retour
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-muted">
        Chaque décision est journalisée (audit). Une exclusion issue des règles R1–R5 ne peut pas
        être annulée ici : corrigez les données puis relancez le classifieur.
      </p>
      <PlatformHealth health={health} />
      <CatalogReviews total={catalogReviews.total} reviews={catalogReviews.reviews} />
      <OperatorView
        reviews={reviews.map((r) => ({
          id: r.id,
          name: r.name,
          website_url: r.website_url,
          tagline: r.tagline ?? r.short_description,
          assessments: r.product_exclusion_assessments.map((a) => ({
            status: a.status,
            rules: a.matched_rules,
            version: a.rule_set_version,
            created_at: a.created_at,
          })),
        }))}
        reports={reports.map((r) => ({
          id: r.id,
          product: r.saas_products?.name ?? "?",
          type: r.report_type,
          field_key: r.field_key,
          message: r.message,
          created_at: r.created_at,
        }))}
      />
    </main>
  );
}
