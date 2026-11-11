import type {
  ExternalResearchSection,
  ExternalResearchStrategy,
  ExternalAiDestination,
} from "@sor/contracts";
import type { Json } from "@sor/database";

export interface ResearchFact {
  value: unknown;
  status: string;
  verified_at: string | null;
  evidence_ids: string[];
}

export interface ExternalResearchProductOverview {
  id: string;
  slug: string;
  name: ResearchFact;
  official_website: ResearchFact;
  tagline: ResearchFact;
  short_description: ResearchFact;
  description: ResearchFact;
  problem_solved: ResearchFact;
  value_proposition: ResearchFact;
  categories: Array<{ slug: string; name: string; is_primary: boolean }>;
  customer_type: ResearchFact;
  pricing_status: ResearchFact;
  billing_models: ResearchFact;
  launch_year: ResearchFact;
  company: Record<string, unknown> | null;
}

export interface ExternalResearchEvidence {
  evidence_id: string;
  claim_type: string;
  claim: string | null;
  fact_status: string;
  verification_status: string;
  reliability_level: number;
  published_at: string | null;
  observed_at: string | null;
  source: {
    name: string | null;
    title: string | null;
    url: string | null;
    retrieved_at: string | null;
  };
}

export interface ExternalResearchContext {
  context_version: string;
  subject: {
    type: "product" | "product_set";
    label: string;
    product_ids: string[];
    products: Array<{ id: string; slug: string; name: string; website_url: string | null }>;
  };
  overview: ExternalResearchProductOverview[];
  sections: Partial<Record<ExternalResearchSection, unknown[]>>;
  evidence_index: ExternalResearchEvidence[];
  information_gaps: string[];
}

export interface ExternalResearchSessionSummary {
  id: string;
  workspace_id: string;
  created_by: string;
  subject_type: string;
  subject_snapshot: Json;
  destination: ExternalAiDestination;
  strategy: ExternalResearchStrategy;
  status: "prompt_ready" | "response_imported";
  created_at: string;
  updated_at: string;
}

export interface ExternalResearchSessionDetails extends ExternalResearchSessionSummary {
  included_sections: ExternalResearchSection[];
  context_version: string;
  context_json: ExternalResearchContext;
  prompt_version: string;
  prompt_text: string;
  answer_text: string | null;
  notes: string | null;
}
