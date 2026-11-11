import { z } from "zod";
import { UUIDSchema } from "./common";

export const ExternalAiDestinationSchema = z.enum(["claude", "chatgpt", "gemini", "perplexity"]);
export const ExternalResearchStrategySchema = z.enum([
  // PRODUCT_VISION §4 A–D (S8.4): discovery, customer voice, opportunity analysis.
  "saas_discovery",
  "customer_voice",
  "opportunity_analysis",
  "better_alternative",
  "cross_competitor_pain_intelligence",
  "independent_saas_discovery",
  "france_europe_adaptation",
  "red_team",
  "compare_competitors",
]);
export const ExternalResearchSectionSchema = z.enum([
  "features",
  "pricing",
  "feedback",
  "competitors",
]);

/** What the dossier is about: 1–5 catalog SaaS, a category or a Pain Point Cluster. */
export const ExternalResearchSubjectTypeSchema = z.enum([
  "product",
  "product_set",
  "category",
  "pain_point_cluster",
]);

export const CreateExternalResearchSchema = z
  .object({
    product_ids: z.array(UUIDSchema).min(1).max(5).optional(),
    category_slug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,99}$/)
      .optional(),
    cluster_id: UUIDSchema.optional(),
    destination: ExternalAiDestinationSchema,
    strategy: ExternalResearchStrategySchema,
    included_sections: z.array(ExternalResearchSectionSchema).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    const subjects = [value.product_ids, value.category_slug, value.cluster_id].filter(
      (subject) => subject !== undefined,
    );
    if (subjects.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["product_ids"],
        message: "Exactly one subject: product_ids, category_slug or cluster_id",
      });
    }
    if (value.product_ids && new Set(value.product_ids).size !== value.product_ids.length) {
      ctx.addIssue({ code: "custom", path: ["product_ids"], message: "Products must be unique" });
    }
    if (new Set(value.included_sections).size !== value.included_sections.length) {
      ctx.addIssue({
        code: "custom",
        path: ["included_sections"],
        message: "Sections must be unique",
      });
    }
  });

export const ImportExternalResearchAnswerSchema = z
  .object({
    answer_text: z.string().trim().min(1).max(50_000),
    notes: z.string().max(5_000).nullable().optional(),
  })
  .strict();

export type ExternalAiDestination = z.infer<typeof ExternalAiDestinationSchema>;
export type ExternalResearchStrategy = z.infer<typeof ExternalResearchStrategySchema>;
export type ExternalResearchSection = z.infer<typeof ExternalResearchSectionSchema>;
export type ExternalResearchSubjectType = z.infer<typeof ExternalResearchSubjectTypeSchema>;
export type CreateExternalResearch = z.infer<typeof CreateExternalResearchSchema>;
export type ImportExternalResearchAnswer = z.infer<typeof ImportExternalResearchAnswerSchema>;
