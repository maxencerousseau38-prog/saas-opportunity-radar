import type {
  ExternalResearchSection,
  ExternalResearchStrategy,
  ExternalResearchSubjectType,
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

/** What SOR holds for each product, to state how much of it the dossier carries (S8.4). */
export interface ExternalResearchCoverage {
  products: Array<{
    product_id: string;
    name: string;
    /** Customer feedback items SOR holds for this product (null: unknown). */
    feedback_available: number | null;
    /** Evidence items SOR holds for this product. */
    evidence_available: number | null;
  }>;
  /** Category subject: catalog SaaS in the category and how the sample was chosen. */
  category?: { slug: string; name: string; total_products: number; sample_rule: string };
  /** Pain Point Cluster subject: active members held vs included. */
  cluster_members_available?: number;
}

export interface ExternalResearchClusterContext {
  id: string;
  name: string;
  description: string;
  problem_category: string;
  review_status: string;
  algorithm_version: string;
  statistics: Record<string, unknown>;
  /** Clusters are produced by SOR's internal Pain Point engine (providers simulated until PD-24). */
  provenance_warning: string;
  members: Array<{
    problem_statement: string;
    severity: number | null;
    resolution_status: string;
    workaround: string | null;
    desired_solution: string | null;
    product_id: string | null;
    excerpt: string | null;
    published_at: string | null;
    source_name: string | null;
    source_url: string | null;
    evidence_id: string | null;
  }>;
}

export interface ExternalResearchContext {
  context_version: string;
  subject: {
    type: ExternalResearchSubjectType;
    label: string;
    product_ids: string[];
    products: Array<{ id: string; slug: string; name: string; website_url: string | null }>;
    category_slug?: string;
    cluster_id?: string;
  };
  overview: ExternalResearchProductOverview[];
  sections: Partial<Record<ExternalResearchSection, unknown[]>>;
  evidence_index: ExternalResearchEvidence[];
  information_gaps: string[];
  /** Absent in sessions saved before S8.4. */
  coverage?: ExternalResearchCoverage;
  cluster?: ExternalResearchClusterContext;
  /** Automatic reductions applied to stay within the prompt limit (S8.4). */
  reductions?: string[];
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
