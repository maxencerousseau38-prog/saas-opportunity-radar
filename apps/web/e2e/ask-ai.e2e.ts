// S8.4 Ask AI completion on the labelled demo fixtures: a category dossier
// (bounded sample with its stated coverage) and the creator / owner / admin
// rule for importing an answer and deleting a session, plus deletion itself.
// Ask AI stays a manual handoff: nothing is sent to an assistant.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { MEMBER, OWNER, VIEWER, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Top-level category of a demo product (the dossier samples its SaaS). */
async function topCategoryOf(slug: string): Promise<{ slug: string; name: string }> {
  const { data } = await admin
    .from("saas_products")
    .select("product_categories(is_primary, categories(slug, name, parent_id))")
    .eq("slug", slug)
    .single();
  const links = (data?.product_categories ?? []) as unknown as Array<{
    is_primary: boolean;
    categories: { slug: string; name: string; parent_id: string | null };
  }>;
  const primary = links.find((l) => l.is_primary)?.categories ?? links[0]!.categories;
  if (!primary.parent_id) return primary;
  const { data: parent } = await admin
    .from("categories")
    .select("slug, name")
    .eq("id", primary.parent_id)
    .single();
  return parent as { slug: string; name: string };
}

test("Ask AI prepares a category dossier with a stated, bounded sample", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const category = await topCategoryOf("mailtide");
  await page.goto(`/w/${ws}/ask-ai`);
  await page.getByLabel("Ou étudier une catégorie").selectOption(category.slug);
  await page.getByRole("button", { name: "Charger la catégorie" }).click();
  await expect(page).toHaveURL(new RegExp(`/ask-ai\\?category=${category.slug}`));
  const coverage = page.getByTestId("ask-ai-coverage");
  await expect(coverage).toContainText(
    new RegExp(
      `Catégorie « ${category.name} » : \\d+ SaaS transmis sur \\d+ SaaS visibles dans SOR`,
    ),
  );
  await expect(coverage).toContainText("ne contient pas tous les avis");
  await page.getByLabel("Stratégie de recherche").selectOption("saas_discovery");
  await page.getByRole("button", { name: "Générer et enregistrer le prompt" }).click();
  await expect(page).toHaveURL(/\/ask-ai\?session=/);
  const prompt = page.getByLabel("Prompt de recherche");
  await expect(prompt).toHaveValue(new RegExp(`Sujet : Catégorie : ${category.name}`));
  await expect(prompt).toHaveValue(/Découvrir et enrichir des SaaS/);
  await expect(prompt).toHaveValue(/## Couverture du dossier/);
});

test("only the creator or an owner/admin imports an answer or deletes a session", async ({
  page,
  browser,
}) => {
  const ws = await signIn(page, OWNER);
  const { data: product } = await admin
    .from("saas_products")
    .select("id")
    .eq("slug", "mailtide")
    .single();
  const base = `/api/v1/workspaces/${ws}/ai-research`;

  // A member creates a session.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signIn(member, MEMBER);
  const created = await member.request.post(base, {
    data: {
      product_ids: [product!.id],
      destination: "perplexity",
      strategy: "opportunity_analysis",
      included_sections: ["pricing"],
    },
  });
  expect(created.status()).toBe(201);
  const session = (await created.json()) as { data: { id: string; prompt_text: string } };
  expect(session.data.prompt_text).toContain("Grille de référence SOR");

  // A viewer can read but neither create, import nor delete.
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signIn(viewer, VIEWER);
  expect((await viewer.request.get(`${base}/${session.data.id}`)).status()).toBe(200);
  expect(
    (
      await viewer.request.post(base, {
        data: {
          product_ids: [product!.id],
          destination: "claude",
          strategy: "red_team",
          included_sections: [],
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await viewer.request.patch(`${base}/${session.data.id}`, {
        data: { answer_text: "Tentative" },
      })
    ).status(),
  ).toBe(403);
  expect((await viewer.request.delete(`${base}/${session.data.id}`)).status()).toBe(403);

  // The owner (not the creator) may import an answer: owner/admin rule.
  const imported = await page.request.patch(`${base}/${session.data.id}`, {
    data: { answer_text: "Réponse externe de test, non vérifiée." },
  });
  expect(imported.status()).toBe(200);

  // An owner's session cannot be changed or deleted by a member.
  const ownerSession = await page.request.post(base, {
    data: {
      product_ids: [product!.id],
      destination: "claude",
      strategy: "customer_voice",
      included_sections: ["feedback"],
    },
  });
  expect(ownerSession.status()).toBe(201);
  const ownerId = ((await ownerSession.json()) as { data: { id: string } }).data.id;
  expect(
    (
      await member.request.patch(`${base}/${ownerId}`, {
        data: { answer_text: "Pas autorisé" },
      })
    ).status(),
  ).toBe(403);
  expect((await member.request.delete(`${base}/${ownerId}`)).status()).toBe(403);

  // The creator deletes their own session; the owner deletes any session.
  expect((await member.request.delete(`${base}/${session.data.id}`)).status()).toBe(204);
  expect((await member.request.get(`${base}/${session.data.id}`)).status()).toBe(404);
  expect((await page.request.delete(`${base}/${ownerId}`)).status()).toBe(204);
  expect((await page.request.get(`${base}/${ownerId}`)).status()).toBe(404);
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "external_research.delete")
    .in("resource_id", [session.data.id, ownerId]);
  expect(count).toBe(2);

  await memberContext.close();
  await viewerContext.close();
});
