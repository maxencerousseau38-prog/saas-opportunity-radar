import { z } from "zod";
import { UUIDSchema } from "./common";

export const ExternalAiDestinationSchema = z.enum(["claude", "chatgpt", "gemini", "perplexity"]);
export const ExternalResearchStrategySchema = z.enum([
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

export const CreateExternalResearchSchema = z
  .object({
    product_ids: z.array(UUIDSchema).min(1).max(5),
    destination: ExternalAiDestinationSchema,
    strategy: ExternalResearchStrategySchema,
    included_sections: z.array(ExternalResearchSectionSchema).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.product_ids).size !== value.product_ids.length) {
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
export type CreateExternalResearch = z.infer<typeof CreateExternalResearchSchema>;
export type ImportExternalResearchAnswer = z.infer<typeof ImportExternalResearchAnswerSchema>;
