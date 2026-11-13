
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_step_runs": {
                  Row: {
                    "agent_key": string,"attempt": number,"completed_at": string | null,"contract_version": string,"cost_usd": number | null,"created_at": string,"error_code": string | null,"error_message": string | null,"evidence_ids": (string)[],"id": string,"input_hash": string | null,"input_tokens": number | null,"job_execution_id": string,"latency_ms": number | null,"model": string | null,"output_hash": string | null,"output_json": Json | null,"output_tokens": number | null,"prompt_version": string | null,"provider": string | null,"started_at": string | null,"state": string,"step_key": string,"warnings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_key": string,"attempt"?: number,"completed_at"?: string | null,"contract_version": string,"cost_usd"?: number | null,"created_at"?: string,"error_code"?: string | null,"error_message"?: string | null,"evidence_ids"?: (string)[],"id"?: string,"input_hash"?: string | null,"input_tokens"?: number | null,"job_execution_id": string,"latency_ms"?: number | null,"model"?: string | null,"output_hash"?: string | null,"output_json"?: Json | null,"output_tokens"?: number | null,"prompt_version"?: string | null,"provider"?: string | null,"started_at"?: string | null,"state"?: string,"step_key": string,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "agent_key"?: string,"attempt"?: number,"completed_at"?: string | null,"contract_version"?: string,"cost_usd"?: number | null,"created_at"?: string,"error_code"?: string | null,"error_message"?: string | null,"evidence_ids"?: (string)[],"id"?: string,"input_hash"?: string | null,"input_tokens"?: number | null,"job_execution_id"?: string,"latency_ms"?: number | null,"model"?: string | null,"output_hash"?: string | null,"output_json"?: Json | null,"output_tokens"?: number | null,"prompt_version"?: string | null,"provider"?: string | null,"started_at"?: string | null,"state"?: string,"step_key"?: string,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_step_runs_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: false
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    }
                  ]
                },"analysis_dimension_scores": {
                  Row: {
                    "analysis_id": string,"assessment_status": Database["public"]['Enums']["assessment_status"],"dimension_key": Database["public"]['Enums']["dimension_key"],"explanation": string,"missing_information": NonNullable<Json>,"proposed_by_step_id": string | null,"rating": number | null,"weight": number,"weighted_points": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"assessment_status": Database["public"]['Enums']["assessment_status"],"dimension_key": Database["public"]['Enums']["dimension_key"],"explanation": string,"missing_information"?: NonNullable<Json>,"proposed_by_step_id"?: string | null,"rating"?: number | null,"weight": number,"weighted_points"?: never
                  }
                  Update: {
                    "analysis_id"?: string,"assessment_status"?: Database["public"]['Enums']["assessment_status"],"dimension_key"?: Database["public"]['Enums']["dimension_key"],"explanation"?: string,"missing_information"?: NonNullable<Json>,"proposed_by_step_id"?: string | null,"rating"?: number | null,"weight"?: number,"weighted_points"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_dimension_scores_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "opportunity_analyses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_dimension_scores_proposed_by_step_id_fkey"
      columns: ["proposed_by_step_id"]
isOneToOne: false
      referencedRelation: "agent_step_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"analysis_evidence": {
                  Row: {
                    "added_by_step_id": string | null,"analysis_id": string,"created_at": string,"evidence_item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by_step_id"?: string | null,"analysis_id": string,"created_at"?: string,"evidence_item_id": string
                  }
                  Update: {
                    "added_by_step_id"?: string | null,"analysis_id"?: string,"created_at"?: string,"evidence_item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_evidence_added_by_step_id_fkey"
      columns: ["added_by_step_id"]
isOneToOne: false
      referencedRelation: "agent_step_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_evidence_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "opportunity_analyses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_evidence_evidence_item_id_fkey"
      columns: ["evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    }
                  ]
                },"analysis_findings": {
                  Row: {
                    "analysis_id": string,"confidence": number | null,"created_at": string,"description": string,"dimension_key": Database["public"]['Enums']["dimension_key"] | null,"finding_type": Database["public"]['Enums']["finding_type"],"id": string,"is_hypothesis": boolean,"is_substantiated": boolean | null,"priority": number | null,"recommendation": string | null,"severity": Database["public"]['Enums']["kill_severity"] | null,"source_agent": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"confidence"?: number | null,"created_at"?: string,"description": string,"dimension_key"?: Database["public"]['Enums']["dimension_key"] | null,"finding_type": Database["public"]['Enums']["finding_type"],"id"?: string,"is_hypothesis": boolean,"is_substantiated"?: boolean | null,"priority"?: number | null,"recommendation"?: string | null,"severity"?: Database["public"]['Enums']["kill_severity"] | null,"source_agent": string,"title": string
                  }
                  Update: {
                    "analysis_id"?: string,"confidence"?: number | null,"created_at"?: string,"description"?: string,"dimension_key"?: Database["public"]['Enums']["dimension_key"] | null,"finding_type"?: Database["public"]['Enums']["finding_type"],"id"?: string,"is_hypothesis"?: boolean,"is_substantiated"?: boolean | null,"priority"?: number | null,"recommendation"?: string | null,"severity"?: Database["public"]['Enums']["kill_severity"] | null,"source_agent"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_findings_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "opportunity_analyses"
      referencedColumns: ["id"]
    }
                  ]
                },"analysis_subject_products": {
                  Row: {
                    "analysis_id": string,"product_id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"product_id": string,"role": string
                  }
                  Update: {
                    "analysis_id"?: string,"product_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_subject_products_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "opportunity_analyses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_subject_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_user_id": string | null,"created_at": string,"id": string,"metadata": NonNullable<Json>,"request_id": string | null,"resource_id": string | null,"resource_type": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"request_id"?: string | null,"resource_id"?: string | null,"resource_type": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"request_id"?: string | null,"resource_id"?: string | null,"resource_type"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_correction_reports": {
                  Row: {
                    "created_at": string,"field_key": string | null,"id": string,"message": string,"product_id": string,"report_type": string,"reported_by": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"field_key"?: string | null,"id"?: string,"message": string,"product_id": string,"report_type": string,"reported_by": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"field_key"?: string | null,"id"?: string,"message"?: string,"product_id"?: string,"report_type"?: string,"reported_by"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_correction_reports_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_correction_reports_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_field_provenance": {
                  Row: {
                    "company_id": string | null,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"field_key": string,"id": string,"is_current": boolean,"product_id": string | null,"selected_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"field_key": string,"id"?: string,"is_current"?: boolean,"product_id"?: string | null,"selected_at"?: string
                  }
                  Update: {
                    "company_id"?: string | null,"evidence_id"?: string,"fact_status"?: Database["public"]['Enums']["fact_status"],"field_key"?: string,"id"?: string,"is_current"?: boolean,"product_id"?: string | null,"selected_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_field_provenance_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_field_provenance_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_field_provenance_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_listing_reviews": {
                  Row: {
                    "candidate_product_ids": (string)[],"content_hash": string,"exclusion": NonNullable<Json>,"external_id": string,"first_seen_at": string,"id": string,"last_seen_at": string,"listing": NonNullable<Json>,"reason": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"resolved_product_id": string | null,"source_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_product_ids"?: (string)[],"content_hash": string,"exclusion": NonNullable<Json>,"external_id": string,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"listing": NonNullable<Json>,"reason": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_product_id"?: string | null,"source_id": string,"status"?: string
                  }
                  Update: {
                    "candidate_product_ids"?: (string)[],"content_hash"?: string,"exclusion"?: NonNullable<Json>,"external_id"?: string,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"listing"?: NonNullable<Json>,"reason"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_product_id"?: string | null,"source_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_listing_reviews_resolved_product_id_fkey"
      columns: ["resolved_product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_listing_reviews_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"is_permanently_excluded": boolean,"is_user_visible": boolean,"name": string,"parent_id": string | null,"priority_weight": number,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_permanently_excluded"?: boolean,"is_user_visible"?: boolean,"name": string,"parent_id"?: string | null,"priority_weight"?: number,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_permanently_excluded"?: boolean,"is_user_visible"?: boolean,"name"?: string,"parent_id"?: string | null,"priority_weight"?: number,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_items": {
                  Row: {
                    "added_at": string,"added_by": string,"collection_id": string,"generated_opportunity_id": string | null,"id": string,"notes": string | null,"product_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by": string,"collection_id": string,"generated_opportunity_id"?: string | null,"id"?: string,"notes"?: string | null,"product_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string,"collection_id"?: string,"generated_opportunity_id"?: string | null,"id"?: string,"notes"?: string | null,"product_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_item_opportunity_fk"
      columns: ["generated_opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "generated_opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "collection_items_collection_id_workspace_id_fkey"
      columns: ["collection_id","workspace_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "collection_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"created_by": string,"description": string | null,"id": string,"name": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"description"?: string | null,"id"?: string,"name": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collections_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "city": string | null,"company_type": Database["public"]['Enums']["company_type"],"country_code": string | null,"created_at": string,"description": string | null,"employee_max": number | null,"employee_min": number | null,"founded_year": number | null,"founder_led": boolean | null,"funding_status": Database["public"]['Enums']["funding_status"],"id": string,"last_verified_at": string | null,"legal_name": string | null,"linkedin_url": string | null,"merged_into_company_id": string | null,"name": string,"primary_domain": string | null,"slug": string,"updated_at": string,"verification_status": Database["public"]['Enums']["verification_status"],"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"company_type"?: Database["public"]['Enums']["company_type"],"country_code"?: string | null,"created_at"?: string,"description"?: string | null,"employee_max"?: number | null,"employee_min"?: number | null,"founded_year"?: number | null,"founder_led"?: boolean | null,"funding_status"?: Database["public"]['Enums']["funding_status"],"id"?: string,"last_verified_at"?: string | null,"legal_name"?: string | null,"linkedin_url"?: string | null,"merged_into_company_id"?: string | null,"name": string,"primary_domain"?: string | null,"slug": string,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"website_url"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"company_type"?: Database["public"]['Enums']["company_type"],"country_code"?: string | null,"created_at"?: string,"description"?: string | null,"employee_max"?: number | null,"employee_min"?: number | null,"founded_year"?: number | null,"founder_led"?: boolean | null,"funding_status"?: Database["public"]['Enums']["funding_status"],"id"?: string,"last_verified_at"?: string | null,"legal_name"?: string | null,"linkedin_url"?: string | null,"merged_into_company_id"?: string | null,"name"?: string,"primary_domain"?: string | null,"slug"?: string,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_merged_into_company_id_fkey"
      columns: ["merged_into_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_people": {
                  Row: {
                    "company_id": string,"created_at": string,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"full_name": string,"id": string,"public_profile_url": string | null,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"full_name": string,"id"?: string,"public_profile_url"?: string | null,"role": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"evidence_id"?: string,"fact_status"?: Database["public"]['Enums']["fact_status"],"full_name"?: string,"id"?: string,"public_profile_url"?: string | null,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_people_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_people_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    }
                  ]
                },"company_signals": {
                  Row: {
                    "company_id": string | null,"confidence": number | null,"created_at": string,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"id": string,"product_id": string | null,"signal_date": string | null,"signal_type": string,"signal_value": NonNullable<Json>,"verification_status": Database["public"]['Enums']["verification_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"evidence_id": string,"fact_status": Database["public"]['Enums']["fact_status"],"id"?: string,"product_id"?: string | null,"signal_date"?: string | null,"signal_type": string,"signal_value": NonNullable<Json>,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Update: {
                    "company_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"evidence_id"?: string,"fact_status"?: Database["public"]['Enums']["fact_status"],"id"?: string,"product_id"?: string | null,"signal_date"?: string | null,"signal_type"?: string,"signal_value"?: NonNullable<Json>,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_signals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_signals_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_signals_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"competitor_links": {
                  Row: {
                    "competitor_product_id": string,"created_at": string,"evidence_id": string | null,"explanation": string | null,"id": string,"last_verified_at": string | null,"product_id": string,"relationship_type": Database["public"]['Enums']["competitor_relationship"],"similarity_score": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "competitor_product_id": string,"created_at"?: string,"evidence_id"?: string | null,"explanation"?: string | null,"id"?: string,"last_verified_at"?: string | null,"product_id": string,"relationship_type": Database["public"]['Enums']["competitor_relationship"],"similarity_score"?: number | null
                  }
                  Update: {
                    "competitor_product_id"?: string,"created_at"?: string,"evidence_id"?: string | null,"explanation"?: string | null,"id"?: string,"last_verified_at"?: string | null,"product_id"?: string,"relationship_type"?: Database["public"]['Enums']["competitor_relationship"],"similarity_score"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitor_links_competitor_product_id_fkey"
      columns: ["competitor_product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competitor_links_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competitor_links_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_feedback": {
                  Row: {
                    "author_company_reference": string | null,"author_reference_hash": string | null,"content_storage_status": Database["public"]['Enums']["content_storage_status"],"created_at": string,"deduplication_hash": string,"evidence_item_id": string,"external_review_id": string | null,"id": string,"is_near_duplicate_of": string | null,"language": string | null,"original_text": string | null,"product_id": string,"published_at": string | null,"rating": number | null,"rating_scale_max": number | null,"sentiment": Database["public"]['Enums']["review_sentiment"],"source_snapshot_id": string,"summarized_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_company_reference"?: string | null,"author_reference_hash"?: string | null,"content_storage_status": Database["public"]['Enums']["content_storage_status"],"created_at"?: string,"deduplication_hash": string,"evidence_item_id": string,"external_review_id"?: string | null,"id"?: string,"is_near_duplicate_of"?: string | null,"language"?: string | null,"original_text"?: string | null,"product_id": string,"published_at"?: string | null,"rating"?: number | null,"rating_scale_max"?: number | null,"sentiment"?: Database["public"]['Enums']["review_sentiment"],"source_snapshot_id": string,"summarized_text"?: string | null
                  }
                  Update: {
                    "author_company_reference"?: string | null,"author_reference_hash"?: string | null,"content_storage_status"?: Database["public"]['Enums']["content_storage_status"],"created_at"?: string,"deduplication_hash"?: string,"evidence_item_id"?: string,"external_review_id"?: string | null,"id"?: string,"is_near_duplicate_of"?: string | null,"language"?: string | null,"original_text"?: string | null,"product_id"?: string,"published_at"?: string | null,"rating"?: number | null,"rating_scale_max"?: number | null,"sentiment"?: Database["public"]['Enums']["review_sentiment"],"source_snapshot_id"?: string,"summarized_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_feedback_evidence_item_id_fkey"
      columns: ["evidence_item_id"]
isOneToOne: true
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_feedback_is_near_duplicate_of_fkey"
      columns: ["is_near_duplicate_of"]
isOneToOne: false
      referencedRelation: "customer_feedback"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_feedback_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_feedback_source_snapshot_id_fkey"
      columns: ["source_snapshot_id"]
isOneToOne: false
      referencedRelation: "source_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"dimension_score_evidence": {
                  Row: {
                    "analysis_id": string,"dimension_key": Database["public"]['Enums']["dimension_key"],"evidence_item_id": string,"support_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"dimension_key": Database["public"]['Enums']["dimension_key"],"evidence_item_id": string,"support_type"?: string
                  }
                  Update: {
                    "analysis_id"?: string,"dimension_key"?: Database["public"]['Enums']["dimension_key"],"evidence_item_id"?: string,"support_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dimension_score_evidence_analysis_id_dimension_key_fkey"
      columns: ["analysis_id","dimension_key"]
isOneToOne: false
      referencedRelation: "analysis_dimension_scores"
      referencedColumns: ["analysis_id","dimension_key"]
    },{
      foreignKeyName: "dimension_score_evidence_analysis_id_evidence_item_id_fkey"
      columns: ["analysis_id","evidence_item_id"]
isOneToOne: false
      referencedRelation: "analysis_evidence"
      referencedColumns: ["analysis_id","evidence_item_id"]
    }
                  ]
                },"discovery_candidate_evidence": {
                  Row: {
                    "candidate_id": string,"evidence_item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"evidence_item_id": string
                  }
                  Update: {
                    "candidate_id"?: string,"evidence_item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_candidate_evidence_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "discovery_candidates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_candidate_evidence_evidence_item_id_fkey"
      columns: ["evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    }
                  ]
                },"discovery_candidates": {
                  Row: {
                    "confidence_score": number | null,"created_at": string,"exclusion_status_at_run": Database["public"]['Enums']["exclusion_status"],"fit_breakdown": NonNullable<Json>,"fit_coverage": number | null,"fit_rules_version": string | null,"fit_score": number | null,"id": string,"identity_decision": string,"is_new_to_catalog": boolean,"missing_information": NonNullable<Json>,"possible_duplicate_of_product_id": string | null,"product_id": string,"provenance": NonNullable<Json>,"recommendation_reason": string | null,"rejection_reason": string | null,"review_status": string,"reviewed_at": string | null,"reviewed_by": string | null,"run_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence_score"?: number | null,"created_at"?: string,"exclusion_status_at_run": Database["public"]['Enums']["exclusion_status"],"fit_breakdown"?: NonNullable<Json>,"fit_coverage"?: number | null,"fit_rules_version"?: string | null,"fit_score"?: number | null,"id"?: string,"identity_decision": string,"is_new_to_catalog": boolean,"missing_information"?: NonNullable<Json>,"possible_duplicate_of_product_id"?: string | null,"product_id": string,"provenance"?: NonNullable<Json>,"recommendation_reason"?: string | null,"rejection_reason"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"run_id": string,"updated_at"?: string
                  }
                  Update: {
                    "confidence_score"?: number | null,"created_at"?: string,"exclusion_status_at_run"?: Database["public"]['Enums']["exclusion_status"],"fit_breakdown"?: NonNullable<Json>,"fit_coverage"?: number | null,"fit_rules_version"?: string | null,"fit_score"?: number | null,"id"?: string,"identity_decision"?: string,"is_new_to_catalog"?: boolean,"missing_information"?: NonNullable<Json>,"possible_duplicate_of_product_id"?: string | null,"product_id"?: string,"provenance"?: NonNullable<Json>,"recommendation_reason"?: string | null,"rejection_reason"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"run_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_candidates_possible_duplicate_of_product_id_fkey"
      columns: ["possible_duplicate_of_product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_candidates_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_candidates_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"discovery_runs": {
                  Row: {
                    "candidates_found": number,"candidates_needs_review": number,"candidates_rejected": number,"candidates_retained": number,"channels": NonNullable<Json>,"completed_at": string | null,"created_at": string,"created_by": string,"depth": string,"duplicates_removed": number,"error_summary": string | null,"explicit_filters": NonNullable<Json>,"fit_rules_version": string,"id": string,"interpreted_filters": Json | null,"job_execution_id": string | null,"leads_found": number,"limitations": NonNullable<Json>,"max_results": number,"orchestrator_version": string,"prompt": string,"query_plan": Json | null,"rerun_of_run_id": string | null,"sources_report": NonNullable<Json>,"stage": string | null,"started_at": string | null,"status": Database["public"]['Enums']["run_status"],"terminal_reason": Database["public"]['Enums']["terminal_reason"] | null,"title": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidates_found"?: number,"candidates_needs_review"?: number,"candidates_rejected"?: number,"candidates_retained"?: number,"channels"?: NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"created_by": string,"depth"?: string,"duplicates_removed"?: number,"error_summary"?: string | null,"explicit_filters"?: NonNullable<Json>,"fit_rules_version": string,"id"?: string,"interpreted_filters"?: Json | null,"job_execution_id"?: string | null,"leads_found"?: number,"limitations"?: NonNullable<Json>,"max_results"?: number,"orchestrator_version": string,"prompt": string,"query_plan"?: Json | null,"rerun_of_run_id"?: string | null,"sources_report"?: NonNullable<Json>,"stage"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"title": string,"workspace_id": string
                  }
                  Update: {
                    "candidates_found"?: number,"candidates_needs_review"?: number,"candidates_rejected"?: number,"candidates_retained"?: number,"channels"?: NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"depth"?: string,"duplicates_removed"?: number,"error_summary"?: string | null,"explicit_filters"?: NonNullable<Json>,"fit_rules_version"?: string,"id"?: string,"interpreted_filters"?: Json | null,"job_execution_id"?: string | null,"leads_found"?: number,"limitations"?: NonNullable<Json>,"max_results"?: number,"orchestrator_version"?: string,"prompt"?: string,"query_plan"?: Json | null,"rerun_of_run_id"?: string | null,"sources_report"?: NonNullable<Json>,"stage"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"title"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_runs_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: false
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_runs_rerun_of_run_id_fkey"
      columns: ["rerun_of_run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_runs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_identifiers": {
                  Row: {
                    "company_id": string | null,"created_at": string,"evidence_id": string | null,"id": string,"identifier_type": string,"is_primary": boolean,"product_id": string | null,"source_id": string | null,"valid_from": string,"valid_to": string | null,"value_normalized": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"identifier_type": string,"is_primary"?: boolean,"product_id"?: string | null,"source_id"?: string | null,"valid_from"?: string,"valid_to"?: string | null,"value_normalized": string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"identifier_type"?: string,"is_primary"?: boolean,"product_id"?: string | null,"source_id"?: string | null,"valid_from"?: string,"valid_to"?: string | null,"value_normalized"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_identifiers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_identifiers_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_identifiers_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_identifiers_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence_conflicts": {
                  Row: {
                    "company_id": string | null,"detected_at": string,"evidence_a_id": string,"evidence_b_id": string,"field_key": string,"id": string,"note": string | null,"product_id": string | null,"resolved_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"detected_at"?: string,"evidence_a_id": string,"evidence_b_id": string,"field_key": string,"id"?: string,"note"?: string | null,"product_id"?: string | null,"resolved_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "company_id"?: string | null,"detected_at"?: string,"evidence_a_id"?: string,"evidence_b_id"?: string,"field_key"?: string,"id"?: string,"note"?: string | null,"product_id"?: string | null,"resolved_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_conflicts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_conflicts_evidence_a_id_fkey"
      columns: ["evidence_a_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_conflicts_evidence_b_id_fkey"
      columns: ["evidence_b_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_conflicts_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence_items": {
                  Row: {
                    "category_id": string | null,"claim_text": string,"claim_type": Database["public"]['Enums']["claim_type"],"claim_value": Json | null,"company_id": string | null,"confidence": number | null,"created_at": string,"evidence_type": Database["public"]['Enums']["evidence_type"],"expires_at": string | null,"extracted_by_step_id": string | null,"extraction_method": Database["public"]['Enums']["extraction_method"],"fact_status": Database["public"]['Enums']["fact_status"],"id": string,"monetization_signal": Database["public"]['Enums']["monetization_signal"] | null,"observed_at": string,"product_id": string | null,"published_at": string | null,"reliability_level": number,"source_snapshot_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"claim_text": string,"claim_type": Database["public"]['Enums']["claim_type"],"claim_value"?: Json | null,"company_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"evidence_type": Database["public"]['Enums']["evidence_type"],"expires_at"?: string | null,"extracted_by_step_id"?: string | null,"extraction_method": Database["public"]['Enums']["extraction_method"],"fact_status": Database["public"]['Enums']["fact_status"],"id"?: string,"monetization_signal"?: Database["public"]['Enums']["monetization_signal"] | null,"observed_at"?: string,"product_id"?: string | null,"published_at"?: string | null,"reliability_level": number,"source_snapshot_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null
                  }
                  Update: {
                    "category_id"?: string | null,"claim_text"?: string,"claim_type"?: Database["public"]['Enums']["claim_type"],"claim_value"?: Json | null,"company_id"?: string | null,"confidence"?: number | null,"created_at"?: string,"evidence_type"?: Database["public"]['Enums']["evidence_type"],"expires_at"?: string | null,"extracted_by_step_id"?: string | null,"extraction_method"?: Database["public"]['Enums']["extraction_method"],"fact_status"?: Database["public"]['Enums']["fact_status"],"id"?: string,"monetization_signal"?: Database["public"]['Enums']["monetization_signal"] | null,"observed_at"?: string,"product_id"?: string | null,"published_at"?: string | null,"reliability_level"?: number,"source_snapshot_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_extracted_by_step_fk"
      columns: ["extracted_by_step_id"]
isOneToOne: false
      referencedRelation: "agent_step_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_source_snapshot_id_fkey"
      columns: ["source_snapshot_id"]
isOneToOne: false
      referencedRelation: "source_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"exclusion_rules": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"outcome": string,"pattern": string,"rule_key": string,"rule_kind": string,"rule_set_version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"outcome": string,"pattern": string,"rule_key": string,"rule_kind": string,"rule_set_version": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"outcome"?: string,"pattern"?: string,"rule_key"?: string,"rule_kind"?: string,"rule_set_version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"external_research_sessions": {
                  Row: {
                    "answer_text": string | null,"context_json": NonNullable<Json>,"context_version": string,"created_at": string,"created_by": string,"destination": string,"id": string,"included_sections": (string)[],"notes": string | null,"prompt_text": string,"prompt_version": string,"status": string,"strategy": string,"subject_snapshot": NonNullable<Json>,"subject_type": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_text"?: string | null,"context_json": NonNullable<Json>,"context_version": string,"created_at"?: string,"created_by": string,"destination": string,"id"?: string,"included_sections"?: (string)[],"notes"?: string | null,"prompt_text": string,"prompt_version": string,"status"?: string,"strategy": string,"subject_snapshot": NonNullable<Json>,"subject_type": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "answer_text"?: string | null,"context_json"?: NonNullable<Json>,"context_version"?: string,"created_at"?: string,"created_by"?: string,"destination"?: string,"id"?: string,"included_sections"?: (string)[],"notes"?: string | null,"prompt_text"?: string,"prompt_version"?: string,"status"?: string,"strategy"?: string,"subject_snapshot"?: NonNullable<Json>,"subject_type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_research_sessions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_problem_embeddings": {
                  Row: {
                    "created_at": string,"dimensions": number,"embedding": string,"embedding_model": string,"problem_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dimensions": number,"embedding": string,"embedding_model": string,"problem_id": string
                  }
                  Update: {
                    "created_at"?: string,"dimensions"?: number,"embedding"?: string,"embedding_model"?: string,"problem_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_problem_embeddings_problem_id_fkey"
      columns: ["problem_id"]
isOneToOne: false
      referencedRelation: "feedback_problems"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_problems": {
                  Row: {
                    "agent_step_run_id": string | null,"confidence": number,"created_at": string,"declared_frequency": string | null,"desired_solution": string | null,"extractor_contract_version": string,"extractor_prompt_version": string,"feature_concerned": string | null,"feedback_id": string,"id": string,"is_primary": boolean,"operational_consequence": string | null,"problem_category": Database["public"]['Enums']["problem_category"],"problem_statement": string,"product_id": string,"resolution_status": Database["public"]['Enums']["resolution_status"],"severity": number | null,"switching_intent": Database["public"]['Enums']["switching_intent"],"user_profile": string | null,"vendor_response": string | null,"workaround": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_step_run_id"?: string | null,"confidence": number,"created_at"?: string,"declared_frequency"?: string | null,"desired_solution"?: string | null,"extractor_contract_version": string,"extractor_prompt_version": string,"feature_concerned"?: string | null,"feedback_id": string,"id"?: string,"is_primary"?: boolean,"operational_consequence"?: string | null,"problem_category": Database["public"]['Enums']["problem_category"],"problem_statement": string,"product_id": string,"resolution_status"?: Database["public"]['Enums']["resolution_status"],"severity"?: number | null,"switching_intent"?: Database["public"]['Enums']["switching_intent"],"user_profile"?: string | null,"vendor_response"?: string | null,"workaround"?: string | null
                  }
                  Update: {
                    "agent_step_run_id"?: string | null,"confidence"?: number,"created_at"?: string,"declared_frequency"?: string | null,"desired_solution"?: string | null,"extractor_contract_version"?: string,"extractor_prompt_version"?: string,"feature_concerned"?: string | null,"feedback_id"?: string,"id"?: string,"is_primary"?: boolean,"operational_consequence"?: string | null,"problem_category"?: Database["public"]['Enums']["problem_category"],"problem_statement"?: string,"product_id"?: string,"resolution_status"?: Database["public"]['Enums']["resolution_status"],"severity"?: number | null,"switching_intent"?: Database["public"]['Enums']["switching_intent"],"user_profile"?: string | null,"vendor_response"?: string | null,"workaround"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_problems_agent_step_run_id_fkey"
      columns: ["agent_step_run_id"]
isOneToOne: false
      referencedRelation: "agent_step_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_problems_feedback_id_fkey"
      columns: ["feedback_id"]
isOneToOne: false
      referencedRelation: "customer_feedback"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_problems_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"finding_evidence": {
                  Row: {
                    "analysis_id": string,"evidence_item_id": string,"finding_id": string,"relevance_score": number | null,"support_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"evidence_item_id": string,"finding_id": string,"relevance_score"?: number | null,"support_type"?: string
                  }
                  Update: {
                    "analysis_id"?: string,"evidence_item_id"?: string,"finding_id"?: string,"relevance_score"?: number | null,"support_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finding_evidence_analysis_id_evidence_item_id_fkey"
      columns: ["analysis_id","evidence_item_id"]
isOneToOne: false
      referencedRelation: "analysis_evidence"
      referencedColumns: ["analysis_id","evidence_item_id"]
    },{
      foreignKeyName: "finding_evidence_finding_id_analysis_id_fkey"
      columns: ["finding_id","analysis_id"]
isOneToOne: false
      referencedRelation: "analysis_findings"
      referencedColumns: ["id","analysis_id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "currency": string,"rate_date": string,"rate_to_eur": number,"source_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "currency": string,"rate_date": string,"rate_to_eur": number,"source_key": string
                  }
                  Update: {
                    "currency"?: string,"rate_date"?: string,"rate_to_eur"?: number,"source_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"generated_opportunities": {
                  Row: {
                    "business_model_hypothesis": string | null,"created_at": string,"created_from_run_id": string | null,"description": string,"differentiation": string,"distribution_hypothesis": string | null,"exclusion_status": Database["public"]['Enums']["exclusion_status"],"generator_contract_version": string,"generator_prompt_version": string,"id": string,"is_favorite": boolean,"is_hypothesis": boolean,"name": string,"notes": string | null,"pricing_hypothesis": string | null,"problem_statement": string,"proposed_solution": string,"status": Database["public"]['Enums']["opportunity_status"],"target_persona": string,"technical_feasibility_notes": string | null,"updated_at": string,"validation_needed": string,"value_proposition": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_model_hypothesis"?: string | null,"created_at"?: string,"created_from_run_id"?: string | null,"description": string,"differentiation": string,"distribution_hypothesis"?: string | null,"exclusion_status": Database["public"]['Enums']["exclusion_status"],"generator_contract_version": string,"generator_prompt_version": string,"id"?: string,"is_favorite"?: boolean,"is_hypothesis"?: boolean,"name": string,"notes"?: string | null,"pricing_hypothesis"?: string | null,"problem_statement": string,"proposed_solution": string,"status"?: Database["public"]['Enums']["opportunity_status"],"target_persona": string,"technical_feasibility_notes"?: string | null,"updated_at"?: string,"validation_needed": string,"value_proposition": string,"workspace_id": string
                  }
                  Update: {
                    "business_model_hypothesis"?: string | null,"created_at"?: string,"created_from_run_id"?: string | null,"description"?: string,"differentiation"?: string,"distribution_hypothesis"?: string | null,"exclusion_status"?: Database["public"]['Enums']["exclusion_status"],"generator_contract_version"?: string,"generator_prompt_version"?: string,"id"?: string,"is_favorite"?: boolean,"is_hypothesis"?: boolean,"name"?: string,"notes"?: string | null,"pricing_hypothesis"?: string | null,"problem_statement"?: string,"proposed_solution"?: string,"status"?: Database["public"]['Enums']["opportunity_status"],"target_persona"?: string,"technical_feasibility_notes"?: string | null,"updated_at"?: string,"validation_needed"?: string,"value_proposition"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generated_opportunities_created_from_run_id_fkey"
      columns: ["created_from_run_id"]
isOneToOne: false
      referencedRelation: "pain_point_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generated_opportunities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"generated_opportunity_clusters": {
                  Row: {
                    "cluster_id": string,"opportunity_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cluster_id": string,"opportunity_id": string,"workspace_id": string
                  }
                  Update: {
                    "cluster_id"?: string,"opportunity_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generated_opportunity_clusters_cluster_id_workspace_id_fkey"
      columns: ["cluster_id","workspace_id"]
isOneToOne: false
      referencedRelation: "pain_point_clusters"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "generated_opportunity_clusters_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "generated_opportunities"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"generated_opportunity_products": {
                  Row: {
                    "opportunity_id": string,"product_id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "opportunity_id": string,"product_id": string,"role": string
                  }
                  Update: {
                    "opportunity_id"?: string,"product_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generated_opportunity_products_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "generated_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generated_opportunity_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"job_executions": {
                  Row: {
                    "attempt_count": number,"budget": NonNullable<Json>,"cancel_requested_at": string | null,"completed_at": string | null,"created_at": string,"heartbeat_at": string | null,"id": string,"idempotency_key": string,"job_kind": Database["public"]['Enums']["job_kind"],"last_error_code": string | null,"last_error_message": string | null,"lease_expires_at": string | null,"lease_owner": string | null,"max_attempts": number,"next_attempt_at": string | null,"payload": NonNullable<Json>,"queue_message_id": number | null,"request_hash": string,"requested_by": string | null,"result": NonNullable<Json>,"started_at": string | null,"state": Database["public"]['Enums']["job_state"],"terminal_reason": Database["public"]['Enums']["terminal_reason"] | null,"usage": NonNullable<Json>,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"budget"?: NonNullable<Json>,"cancel_requested_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"heartbeat_at"?: string | null,"id"?: string,"idempotency_key": string,"job_kind": Database["public"]['Enums']["job_kind"],"last_error_code"?: string | null,"last_error_message"?: string | null,"lease_expires_at"?: string | null,"lease_owner"?: string | null,"max_attempts"?: number,"next_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"queue_message_id"?: number | null,"request_hash": string,"requested_by"?: string | null,"result"?: NonNullable<Json>,"started_at"?: string | null,"state"?: Database["public"]['Enums']["job_state"],"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"usage"?: NonNullable<Json>,"workspace_id"?: string | null
                  }
                  Update: {
                    "attempt_count"?: number,"budget"?: NonNullable<Json>,"cancel_requested_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"heartbeat_at"?: string | null,"id"?: string,"idempotency_key"?: string,"job_kind"?: Database["public"]['Enums']["job_kind"],"last_error_code"?: string | null,"last_error_message"?: string | null,"lease_expires_at"?: string | null,"lease_owner"?: string | null,"max_attempts"?: number,"next_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"queue_message_id"?: number | null,"request_hash"?: string,"requested_by"?: string | null,"result"?: NonNullable<Json>,"started_at"?: string | null,"state"?: Database["public"]['Enums']["job_state"],"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"usage"?: NonNullable<Json>,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_executions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"market_gap_clusters": {
                  Row: {
                    "cluster_id": string,"gap_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cluster_id": string,"gap_id": string,"workspace_id": string
                  }
                  Update: {
                    "cluster_id"?: string,"gap_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_gap_clusters_cluster_id_workspace_id_fkey"
      columns: ["cluster_id","workspace_id"]
isOneToOne: false
      referencedRelation: "pain_point_clusters"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "market_gap_clusters_gap_id_workspace_id_fkey"
      columns: ["gap_id","workspace_id"]
isOneToOne: false
      referencedRelation: "market_gaps"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"market_gap_evidence": {
                  Row: {
                    "evidence_item_id": string,"gap_id": string,"support_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "evidence_item_id": string,"gap_id": string,"support_type"?: string
                  }
                  Update: {
                    "evidence_item_id"?: string,"gap_id"?: string,"support_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_gap_evidence_evidence_item_id_fkey"
      columns: ["evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "market_gap_evidence_gap_id_fkey"
      columns: ["gap_id"]
isOneToOne: false
      referencedRelation: "market_gaps"
      referencedColumns: ["id"]
    }
                  ]
                },"market_gaps": {
                  Row: {
                    "confidence": number,"created_at": string,"description": string,"existing_solutions_observed": NonNullable<Json>,"gap_type": string,"id": string,"run_id": string,"title": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": number,"created_at"?: string,"description": string,"existing_solutions_observed"?: NonNullable<Json>,"gap_type": string,"id"?: string,"run_id": string,"title": string,"workspace_id": string
                  }
                  Update: {
                    "confidence"?: number,"created_at"?: string,"description"?: string,"existing_solutions_observed"?: NonNullable<Json>,"gap_type"?: string,"id"?: string,"run_id"?: string,"title"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_gaps_run_id_workspace_id_fkey"
      columns: ["run_id","workspace_id"]
isOneToOne: false
      referencedRelation: "pain_point_runs"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"opportunity_analyses": {
                  Row: {
                    "analysis_depth": string,"analysis_type": Database["public"]['Enums']["analysis_type"],"analysis_version": string,"completed_at": string | null,"confidence_score": number | null,"created_at": string,"created_by": string,"decision_band": Database["public"]['Enums']["decision_band"] | null,"executive_summary": string | null,"id": string,"job_execution_id": string | null,"limitations": NonNullable<Json>,"provisional_points": number | null,"report_json": Json | null,"score_coverage": number | null,"score_total": number | null,"scoring_rules_version": string,"started_at": string | null,"status": Database["public"]['Enums']["run_status"],"subject_category_id": string | null,"subject_cluster_id": string | null,"subject_generated_opportunity_id": string | null,"subject_product_id": string | null,"subject_snapshot": NonNullable<Json>,"subject_type": Database["public"]['Enums']["analysis_subject_type"],"target_market": string,"terminal_reason": Database["public"]['Enums']["terminal_reason"] | null,"user_context": NonNullable<Json>,"verdict": Database["public"]['Enums']["analysis_verdict"] | null,"verdict_reasons": NonNullable<Json>,"willingness_to_pay_score": number | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_depth"?: string,"analysis_type"?: Database["public"]['Enums']["analysis_type"],"analysis_version": string,"completed_at"?: string | null,"confidence_score"?: number | null,"created_at"?: string,"created_by": string,"decision_band"?: Database["public"]['Enums']["decision_band"] | null,"executive_summary"?: string | null,"id"?: string,"job_execution_id"?: string | null,"limitations"?: NonNullable<Json>,"provisional_points"?: number | null,"report_json"?: Json | null,"score_coverage"?: number | null,"score_total"?: number | null,"scoring_rules_version": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"subject_category_id"?: string | null,"subject_cluster_id"?: string | null,"subject_generated_opportunity_id"?: string | null,"subject_product_id"?: string | null,"subject_snapshot": NonNullable<Json>,"subject_type": Database["public"]['Enums']["analysis_subject_type"],"target_market"?: string,"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"user_context"?: NonNullable<Json>,"verdict"?: Database["public"]['Enums']["analysis_verdict"] | null,"verdict_reasons"?: NonNullable<Json>,"willingness_to_pay_score"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "analysis_depth"?: string,"analysis_type"?: Database["public"]['Enums']["analysis_type"],"analysis_version"?: string,"completed_at"?: string | null,"confidence_score"?: number | null,"created_at"?: string,"created_by"?: string,"decision_band"?: Database["public"]['Enums']["decision_band"] | null,"executive_summary"?: string | null,"id"?: string,"job_execution_id"?: string | null,"limitations"?: NonNullable<Json>,"provisional_points"?: number | null,"report_json"?: Json | null,"score_coverage"?: number | null,"score_total"?: number | null,"scoring_rules_version"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"subject_category_id"?: string | null,"subject_cluster_id"?: string | null,"subject_generated_opportunity_id"?: string | null,"subject_product_id"?: string | null,"subject_snapshot"?: NonNullable<Json>,"subject_type"?: Database["public"]['Enums']["analysis_subject_type"],"target_market"?: string,"terminal_reason"?: Database["public"]['Enums']["terminal_reason"] | null,"user_context"?: NonNullable<Json>,"verdict"?: Database["public"]['Enums']["analysis_verdict"] | null,"verdict_reasons"?: NonNullable<Json>,"willingness_to_pay_score"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_analyses_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: false
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_analyses_subject_category_id_fkey"
      columns: ["subject_category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_analyses_subject_cluster_id_workspace_id_fkey"
      columns: ["subject_cluster_id","workspace_id"]
isOneToOne: false
      referencedRelation: "pain_point_clusters"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "opportunity_analyses_subject_generated_opportunity_id_work_fkey"
      columns: ["subject_generated_opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "generated_opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "opportunity_analyses_subject_product_id_fkey"
      columns: ["subject_product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_analyses_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"ops_alerts": {
                  Row: {
                    "alert_key": string,"details": NonNullable<Json>,"id": string,"last_seen_at": string,"message": string,"opened_at": string,"resolved_at": string | null,"severity": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_key": string,"details"?: NonNullable<Json>,"id"?: string,"last_seen_at"?: string,"message": string,"opened_at"?: string,"resolved_at"?: string | null,"severity": string
                  }
                  Update: {
                    "alert_key"?: string,"details"?: NonNullable<Json>,"id"?: string,"last_seen_at"?: string,"message"?: string,"opened_at"?: string,"resolved_at"?: string | null,"severity"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pain_point_cluster_snapshots": {
                  Row: {
                    "affected_product_count": number,"cluster_id": string,"distinct_author_count": number | null,"distinct_company_count": number | null,"feedback_count": number,"id": string,"observed_at": string,"resolution_breakdown": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_product_count": number,"cluster_id": string,"distinct_author_count"?: number | null,"distinct_company_count"?: number | null,"feedback_count": number,"id"?: string,"observed_at"?: string,"resolution_breakdown": NonNullable<Json>
                  }
                  Update: {
                    "affected_product_count"?: number,"cluster_id"?: string,"distinct_author_count"?: number | null,"distinct_company_count"?: number | null,"feedback_count"?: number,"id"?: string,"observed_at"?: string,"resolution_breakdown"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "pain_point_cluster_snapshots_cluster_id_fkey"
      columns: ["cluster_id"]
isOneToOne: false
      referencedRelation: "pain_point_clusters"
      referencedColumns: ["id"]
    }
                  ]
                },"pain_point_clusters": {
                  Row: {
                    "affected_product_count": number,"algorithm_version": string,"confidence_score": number,"created_at": string,"description": string,"distinct_author_count": number | null,"distinct_author_count_status": Database["public"]['Enums']["count_status"],"distinct_company_count": number | null,"distinct_company_count_status": Database["public"]['Enums']["count_status"],"existing_solutions": NonNullable<Json>,"feedback_count": number,"first_detected_at": string,"frequency_label": Database["public"]['Enums']["frequency_label"],"id": string,"last_observed_at": string | null,"name": string,"problem_category": Database["public"]['Enums']["problem_category"],"product_distribution": NonNullable<Json>,"recurrence_score": number | null,"resolution_breakdown": NonNullable<Json>,"review_status": Database["public"]['Enums']["cluster_review_status"],"run_id": string,"severity_score": number | null,"target_persona": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_product_count"?: number,"algorithm_version": string,"confidence_score": number,"created_at"?: string,"description": string,"distinct_author_count"?: number | null,"distinct_author_count_status"?: Database["public"]['Enums']["count_status"],"distinct_company_count"?: number | null,"distinct_company_count_status"?: Database["public"]['Enums']["count_status"],"existing_solutions"?: NonNullable<Json>,"feedback_count"?: number,"first_detected_at"?: string,"frequency_label"?: Database["public"]['Enums']["frequency_label"],"id"?: string,"last_observed_at"?: string | null,"name": string,"problem_category": Database["public"]['Enums']["problem_category"],"product_distribution"?: NonNullable<Json>,"recurrence_score"?: number | null,"resolution_breakdown"?: NonNullable<Json>,"review_status"?: Database["public"]['Enums']["cluster_review_status"],"run_id": string,"severity_score"?: number | null,"target_persona"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "affected_product_count"?: number,"algorithm_version"?: string,"confidence_score"?: number,"created_at"?: string,"description"?: string,"distinct_author_count"?: number | null,"distinct_author_count_status"?: Database["public"]['Enums']["count_status"],"distinct_company_count"?: number | null,"distinct_company_count_status"?: Database["public"]['Enums']["count_status"],"existing_solutions"?: NonNullable<Json>,"feedback_count"?: number,"first_detected_at"?: string,"frequency_label"?: Database["public"]['Enums']["frequency_label"],"id"?: string,"last_observed_at"?: string | null,"name"?: string,"problem_category"?: Database["public"]['Enums']["problem_category"],"product_distribution"?: NonNullable<Json>,"recurrence_score"?: number | null,"resolution_breakdown"?: NonNullable<Json>,"review_status"?: Database["public"]['Enums']["cluster_review_status"],"run_id"?: string,"severity_score"?: number | null,"target_persona"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pain_point_clusters_run_id_workspace_id_fkey"
      columns: ["run_id","workspace_id"]
isOneToOne: false
      referencedRelation: "pain_point_runs"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"pain_point_evidence": {
                  Row: {
                    "cluster_id": string,"created_at": string,"feedback_problem_id": string,"id": string,"membership_confidence": number | null,"membership_source": string,"relevance_score": number | null,"removed_at": string | null,"removed_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cluster_id": string,"created_at"?: string,"feedback_problem_id": string,"id"?: string,"membership_confidence"?: number | null,"membership_source": string,"relevance_score"?: number | null,"removed_at"?: string | null,"removed_by"?: string | null
                  }
                  Update: {
                    "cluster_id"?: string,"created_at"?: string,"feedback_problem_id"?: string,"id"?: string,"membership_confidence"?: number | null,"membership_source"?: string,"relevance_score"?: number | null,"removed_at"?: string | null,"removed_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pain_point_evidence_cluster_id_fkey"
      columns: ["cluster_id"]
isOneToOne: false
      referencedRelation: "pain_point_clusters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pain_point_evidence_feedback_problem_id_fkey"
      columns: ["feedback_problem_id"]
isOneToOne: false
      referencedRelation: "feedback_problems"
      referencedColumns: ["id"]
    }
                  ]
                },"pain_point_run_products": {
                  Row: {
                    "product_id": string,"run_id": string,"total_known_review_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "product_id": string,"run_id": string,"total_known_review_count"?: number | null
                  }
                  Update: {
                    "product_id"?: string,"run_id"?: string,"total_known_review_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pain_point_run_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pain_point_run_products_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pain_point_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"pain_point_runs": {
                  Row: {
                    "algorithm_version": string | null,"clusters_created": number,"completed_at": string | null,"created_at": string,"created_by": string,"error_summary": string | null,"feedback_considered": number,"id": string,"job_execution_id": string | null,"limitations": NonNullable<Json>,"opportunities_generated": number,"parameters": NonNullable<Json>,"problems_extracted": number,"scope_category_id": string | null,"scope_type": Database["public"]['Enums']["pain_scope_type"],"sources_report": NonNullable<Json>,"started_at": string | null,"status": Database["public"]['Enums']["run_status"],"title": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "algorithm_version"?: string | null,"clusters_created"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by": string,"error_summary"?: string | null,"feedback_considered"?: number,"id"?: string,"job_execution_id"?: string | null,"limitations"?: NonNullable<Json>,"opportunities_generated"?: number,"parameters"?: NonNullable<Json>,"problems_extracted"?: number,"scope_category_id"?: string | null,"scope_type": Database["public"]['Enums']["pain_scope_type"],"sources_report"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"title": string,"workspace_id": string
                  }
                  Update: {
                    "algorithm_version"?: string | null,"clusters_created"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"error_summary"?: string | null,"feedback_considered"?: number,"id"?: string,"job_execution_id"?: string | null,"limitations"?: NonNullable<Json>,"opportunities_generated"?: number,"parameters"?: NonNullable<Json>,"problems_extracted"?: number,"scope_category_id"?: string | null,"scope_type"?: Database["public"]['Enums']["pain_scope_type"],"sources_report"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"title"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pain_point_runs_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: false
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pain_point_runs_scope_category_id_fkey"
      columns: ["scope_category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pain_point_runs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_limits": {
                  Row: {
                    "description": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"platform_operators": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pricing_plans": {
                  Row: {
                    "billing_period": string,"checked_at": string,"currency": string | null,"custom_pricing": boolean | null,"evidence_id": string,"has_free_plan": boolean | null,"has_free_trial": boolean | null,"id": string,"is_enterprise_plan": boolean,"is_entry_plan": boolean,"minimum_seats": number | null,"plan_name": string,"price_amount": number | null,"price_per_user": boolean | null,"product_id": string,"superseded_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_period"?: string,"checked_at"?: string,"currency"?: string | null,"custom_pricing"?: boolean | null,"evidence_id": string,"has_free_plan"?: boolean | null,"has_free_trial"?: boolean | null,"id"?: string,"is_enterprise_plan"?: boolean,"is_entry_plan"?: boolean,"minimum_seats"?: number | null,"plan_name": string,"price_amount"?: number | null,"price_per_user"?: boolean | null,"product_id": string,"superseded_at"?: string | null
                  }
                  Update: {
                    "billing_period"?: string,"checked_at"?: string,"currency"?: string | null,"custom_pricing"?: boolean | null,"evidence_id"?: string,"has_free_plan"?: boolean | null,"has_free_trial"?: boolean | null,"id"?: string,"is_enterprise_plan"?: boolean,"is_entry_plan"?: boolean,"minimum_seats"?: number | null,"plan_name"?: string,"price_amount"?: number | null,"price_per_user"?: boolean | null,"product_id"?: string,"superseded_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_plans_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_plans_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_acquisition_channels": {
                  Row: {
                    "channel_category": string,"channel_key": string,"confidence": number | null,"confidence_method": string | null,"confidence_reasons": NonNullable<Json>,"created_at": string,"evidence_id": string | null,"fact_status": Database["public"]['Enums']["fact_status"],"id": string,"inference_rationale": string | null,"is_current": boolean,"method": string,"observed_at": string,"product_id": string,"recorded_by": string | null,"retracted_at": string | null,"retraction_reason": string | null,"role": string,"role_rationale": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_category": string,"channel_key": string,"confidence"?: number | null,"confidence_method"?: string | null,"confidence_reasons"?: NonNullable<Json>,"created_at"?: string,"evidence_id"?: string | null,"fact_status": Database["public"]['Enums']["fact_status"],"id"?: string,"inference_rationale"?: string | null,"is_current"?: boolean,"method": string,"observed_at"?: string,"product_id": string,"recorded_by"?: string | null,"retracted_at"?: string | null,"retraction_reason"?: string | null,"role": string,"role_rationale"?: string | null
                  }
                  Update: {
                    "channel_category"?: string,"channel_key"?: string,"confidence"?: number | null,"confidence_method"?: string | null,"confidence_reasons"?: NonNullable<Json>,"created_at"?: string,"evidence_id"?: string | null,"fact_status"?: Database["public"]['Enums']["fact_status"],"id"?: string,"inference_rationale"?: string | null,"is_current"?: boolean,"method"?: string,"observed_at"?: string,"product_id"?: string,"recorded_by"?: string | null,"retracted_at"?: string | null,"retraction_reason"?: string | null,"role"?: string,"role_rationale"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_acquisition_channels_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_acquisition_channels_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_categories": {
                  Row: {
                    "category_id": string,"confidence": number | null,"is_primary": boolean,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"confidence"?: number | null,"is_primary"?: boolean,"product_id": string
                  }
                  Update: {
                    "category_id"?: string,"confidence"?: number | null,"is_primary"?: boolean,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_categories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_categories_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_exclusion_assessments": {
                  Row: {
                    "created_at": string,"decided_by": string,"id": string,"incidental_mentions": NonNullable<Json>,"matched_rules": NonNullable<Json>,"operator_user_id": string | null,"product_id": string,"reason": string | null,"rule_set_version": string,"status": Database["public"]['Enums']["exclusion_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_by": string,"id"?: string,"incidental_mentions"?: NonNullable<Json>,"matched_rules"?: NonNullable<Json>,"operator_user_id"?: string | null,"product_id": string,"reason"?: string | null,"rule_set_version": string,"status": Database["public"]['Enums']["exclusion_status"]
                  }
                  Update: {
                    "created_at"?: string,"decided_by"?: string,"id"?: string,"incidental_mentions"?: NonNullable<Json>,"matched_rules"?: NonNullable<Json>,"operator_user_id"?: string | null,"product_id"?: string,"reason"?: string | null,"rule_set_version"?: string,"status"?: Database["public"]['Enums']["exclusion_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_exclusion_assessments_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_features": {
                  Row: {
                    "availability": Database["public"]['Enums']["feature_availability"],"confidence": number | null,"created_at": string,"description": string | null,"evidence_id": string | null,"feature_category": string | null,"id": string,"is_primary": boolean,"last_verified_at": string | null,"name": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "availability"?: Database["public"]['Enums']["feature_availability"],"confidence"?: number | null,"created_at"?: string,"description"?: string | null,"evidence_id"?: string | null,"feature_category"?: string | null,"id"?: string,"is_primary"?: boolean,"last_verified_at"?: string | null,"name": string,"product_id": string
                  }
                  Update: {
                    "availability"?: Database["public"]['Enums']["feature_availability"],"confidence"?: number | null,"created_at"?: string,"description"?: string | null,"evidence_id"?: string | null,"feature_category"?: string | null,"id"?: string,"is_primary"?: boolean,"last_verified_at"?: string | null,"name"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_features_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_features_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_integrations": {
                  Row: {
                    "availability": Database["public"]['Enums']["feature_availability"],"created_at": string,"evidence_id": string | null,"id": string,"integration_category": Database["public"]['Enums']["integration_category"],"name": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "availability"?: Database["public"]['Enums']["feature_availability"],"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"integration_category"?: Database["public"]['Enums']["integration_category"],"name": string,"product_id": string
                  }
                  Update: {
                    "availability"?: Database["public"]['Enums']["feature_availability"],"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"integration_category"?: Database["public"]['Enums']["integration_category"],"name"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_integrations_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_integrations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_visual_asset_files": {
                  Row: {
                    "asset_id": string,"byte_size": number,"content": string,"content_type": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"byte_size": number,"content": string,"content_type": string,"created_at"?: string
                  }
                  Update: {
                    "asset_id"?: string,"byte_size"?: number,"content"?: string,"content_type"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_visual_asset_files_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: true
      referencedRelation: "product_visual_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"product_visual_assets": {
                  Row: {
                    "admitted_by": string | null,"alt_text": string,"asset_type": string,"attribution": string | null,"confidence": number | null,"content_hash": string,"created_at": string,"delivery_mode": string,"delivery_path": string | null,"evidence_id": string,"height": number | null,"id": string,"is_current": boolean,"is_primary": boolean,"last_check_status": string | null,"last_checked_at": string | null,"licence_code": string | null,"licence_url": string | null,"observed_at": string,"product_id": string,"removal_reason": string | null,"removed_at": string | null,"rights_basis": string,"rights_evidence_url": string | null,"rights_status": string,"source_url": string,"verification_status": Database["public"]['Enums']["verification_status"],"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admitted_by"?: string | null,"alt_text": string,"asset_type": string,"attribution"?: string | null,"confidence"?: number | null,"content_hash": string,"created_at"?: string,"delivery_mode"?: string,"delivery_path"?: string | null,"evidence_id": string,"height"?: number | null,"id"?: string,"is_current"?: boolean,"is_primary"?: boolean,"last_check_status"?: string | null,"last_checked_at"?: string | null,"licence_code"?: string | null,"licence_url"?: string | null,"observed_at"?: string,"product_id": string,"removal_reason"?: string | null,"removed_at"?: string | null,"rights_basis": string,"rights_evidence_url"?: string | null,"rights_status": string,"source_url": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"width"?: number | null
                  }
                  Update: {
                    "admitted_by"?: string | null,"alt_text"?: string,"asset_type"?: string,"attribution"?: string | null,"confidence"?: number | null,"content_hash"?: string,"created_at"?: string,"delivery_mode"?: string,"delivery_path"?: string | null,"evidence_id"?: string,"height"?: number | null,"id"?: string,"is_current"?: boolean,"is_primary"?: boolean,"last_check_status"?: string | null,"last_checked_at"?: string | null,"licence_code"?: string | null,"licence_url"?: string | null,"observed_at"?: string,"product_id"?: string,"removal_reason"?: string | null,"removed_at"?: string | null,"rights_basis"?: string,"rights_evidence_url"?: string | null,"rights_status"?: string,"source_url"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_visual_assets_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_visual_assets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_usage": {
                  Row: {
                    "agent_step_run_id": string | null,"created_at": string,"estimated_cost_usd": number | null,"id": string,"input_tokens": number | null,"job_execution_id": string | null,"latency_ms": number | null,"model": string,"operation": string,"outcome": string,"output_tokens": number | null,"provider": string,"reported_cost_usd": number | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_step_run_id"?: string | null,"created_at"?: string,"estimated_cost_usd"?: number | null,"id"?: string,"input_tokens"?: number | null,"job_execution_id"?: string | null,"latency_ms"?: number | null,"model": string,"operation": string,"outcome": string,"output_tokens"?: number | null,"provider": string,"reported_cost_usd"?: number | null,"workspace_id"?: string | null
                  }
                  Update: {
                    "agent_step_run_id"?: string | null,"created_at"?: string,"estimated_cost_usd"?: number | null,"id"?: string,"input_tokens"?: number | null,"job_execution_id"?: string | null,"latency_ms"?: number | null,"model"?: string,"operation"?: string,"outcome"?: string,"output_tokens"?: number | null,"provider"?: string,"reported_cost_usd"?: number | null,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_usage_agent_step_run_id_fkey"
      columns: ["agent_step_run_id"]
isOneToOne: false
      referencedRelation: "agent_step_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "provider_usage_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: false
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "provider_usage_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "bucket_key": string,"request_count": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_key": string,"request_count"?: number,"window_start": string
                  }
                  Update: {
                    "bucket_key"?: string,"request_count"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"report_exports": {
                  Row: {
                    "analysis_id": string,"content": string,"content_type": string,"created_at": string,"created_by": string | null,"filename": string,"format": string,"id": string,"job_execution_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"content": string,"content_type": string,"created_at"?: string,"created_by"?: string | null,"filename": string,"format": string,"id"?: string,"job_execution_id": string,"workspace_id": string
                  }
                  Update: {
                    "analysis_id"?: string,"content"?: string,"content_type"?: string,"created_at"?: string,"created_by"?: string | null,"filename"?: string,"format"?: string,"id"?: string,"job_execution_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_exports_analysis_id_workspace_id_fkey"
      columns: ["analysis_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunity_analyses"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "report_exports_job_execution_id_fkey"
      columns: ["job_execution_id"]
isOneToOne: true
      referencedRelation: "job_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_exports_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"saas_products": {
                  Row: {
                    "billing_models": (Database["public"]['Enums']["billing_model"])[],"company_id": string | null,"compatibilities": (string)[],"complexity_level": string,"created_at": string,"customer_countries": (string)[],"customer_type": Database["public"]['Enums']["customer_type"],"description": string | null,"discovery_source_id": string | null,"documentation_url": string | null,"europe_presence": Database["public"]['Enums']["presence_status"],"exclusion_status": Database["public"]['Enums']["exclusion_status"],"first_discovered_at": string,"france_presence": Database["public"]['Enums']["presence_status"],"french_version": Database["public"]['Enums']["presence_status"],"id": string,"languages": (string)[],"last_verified_at": string | null,"launch_year": number | null,"logo_url": string | null,"maturity_stage": Database["public"]['Enums']["maturity_stage"],"merged_into_product_id": string | null,"name": string,"pricing_status": Database["public"]['Enums']["pricing_status"],"primary_domain": string | null,"problem_solved": string | null,"product_status": Database["public"]['Enums']["product_status"],"record_status": Database["public"]['Enums']["record_status"],"search_vector": unknown,"served_countries": (string)[],"short_description": string | null,"slug": string,"tagline": string | null,"technology_tags": (Database["public"]['Enums']["technology_tag"])[],"updated_at": string,"use_cases": (string)[],"value_proposition": string | null,"verification_status": Database["public"]['Enums']["verification_status"],"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_models"?: (Database["public"]['Enums']["billing_model"])[],"company_id"?: string | null,"compatibilities"?: (string)[],"complexity_level"?: string,"created_at"?: string,"customer_countries"?: (string)[],"customer_type"?: Database["public"]['Enums']["customer_type"],"description"?: string | null,"discovery_source_id"?: string | null,"documentation_url"?: string | null,"europe_presence"?: Database["public"]['Enums']["presence_status"],"exclusion_status"?: Database["public"]['Enums']["exclusion_status"],"first_discovered_at"?: string,"france_presence"?: Database["public"]['Enums']["presence_status"],"french_version"?: Database["public"]['Enums']["presence_status"],"id"?: string,"languages"?: (string)[],"last_verified_at"?: string | null,"launch_year"?: number | null,"logo_url"?: string | null,"maturity_stage"?: Database["public"]['Enums']["maturity_stage"],"merged_into_product_id"?: string | null,"name": string,"pricing_status"?: Database["public"]['Enums']["pricing_status"],"primary_domain"?: string | null,"problem_solved"?: string | null,"product_status"?: Database["public"]['Enums']["product_status"],"record_status"?: Database["public"]['Enums']["record_status"],"search_vector"?: unknown,"served_countries"?: (string)[],"short_description"?: string | null,"slug": string,"tagline"?: string | null,"technology_tags"?: (Database["public"]['Enums']["technology_tag"])[],"updated_at"?: string,"use_cases"?: (string)[],"value_proposition"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"],"website_url"?: string | null
                  }
                  Update: {
                    "billing_models"?: (Database["public"]['Enums']["billing_model"])[],"company_id"?: string | null,"compatibilities"?: (string)[],"complexity_level"?: string,"created_at"?: string,"customer_countries"?: (string)[],"customer_type"?: Database["public"]['Enums']["customer_type"],"description"?: string | null,"discovery_source_id"?: string | null,"documentation_url"?: string | null,"europe_presence"?: Database["public"]['Enums']["presence_status"],"exclusion_status"?: Database["public"]['Enums']["exclusion_status"],"first_discovered_at"?: string,"france_presence"?: Database["public"]['Enums']["presence_status"],"french_version"?: Database["public"]['Enums']["presence_status"],"id"?: string,"languages"?: (string)[],"last_verified_at"?: string | null,"launch_year"?: number | null,"logo_url"?: string | null,"maturity_stage"?: Database["public"]['Enums']["maturity_stage"],"merged_into_product_id"?: string | null,"name"?: string,"pricing_status"?: Database["public"]['Enums']["pricing_status"],"primary_domain"?: string | null,"problem_solved"?: string | null,"product_status"?: Database["public"]['Enums']["product_status"],"record_status"?: Database["public"]['Enums']["record_status"],"search_vector"?: unknown,"served_countries"?: (string)[],"short_description"?: string | null,"slug"?: string,"tagline"?: string | null,"technology_tags"?: (Database["public"]['Enums']["technology_tag"])[],"updated_at"?: string,"use_cases"?: (string)[],"value_proposition"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"],"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "saas_products_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saas_products_discovery_source_id_fkey"
      columns: ["discovery_source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saas_products_merged_into_product_id_fkey"
      columns: ["merged_into_product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "created_at": string,"created_by": string,"filters": NonNullable<Json>,"id": string,"is_pinned": boolean,"kind": string,"name": string,"search_text": string | null,"sort_key": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"filters"?: NonNullable<Json>,"id"?: string,"is_pinned"?: boolean,"kind"?: string,"name": string,"search_text"?: string | null,"sort_key"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"filters"?: NonNullable<Json>,"id"?: string,"is_pinned"?: boolean,"kind"?: string,"name"?: string,"search_text"?: string | null,"sort_key"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_searches_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"source_records": {
                  Row: {
                    "canonical_url": string,"external_id": string | null,"first_seen_at": string,"id": string,"source_id": string,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_url": string,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"source_id": string,"title"?: string | null
                  }
                  Update: {
                    "canonical_url"?: string,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"source_id"?: string,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_records_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"source_snapshots": {
                  Row: {
                    "content_hash": string,"extracted_metadata": NonNullable<Json>,"extraction_status": string,"fetch_status": Database["public"]['Enums']["fetch_status"],"http_status": number | null,"id": string,"last_retrieved_at": string,"published_at": string | null,"raw_content_location": string | null,"retrieved_at": string,"source_record_id": string,"storage_status": Database["public"]['Enums']["content_storage_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"extracted_metadata"?: NonNullable<Json>,"extraction_status"?: string,"fetch_status": Database["public"]['Enums']["fetch_status"],"http_status"?: number | null,"id"?: string,"last_retrieved_at"?: string,"published_at"?: string | null,"raw_content_location"?: string | null,"retrieved_at"?: string,"source_record_id": string,"storage_status"?: Database["public"]['Enums']["content_storage_status"]
                  }
                  Update: {
                    "content_hash"?: string,"extracted_metadata"?: NonNullable<Json>,"extraction_status"?: string,"fetch_status"?: Database["public"]['Enums']["fetch_status"],"http_status"?: number | null,"id"?: string,"last_retrieved_at"?: string,"published_at"?: string | null,"raw_content_location"?: string | null,"retrieved_at"?: string,"source_record_id"?: string,"storage_status"?: Database["public"]['Enums']["content_storage_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_snapshots_source_record_id_fkey"
      columns: ["source_record_id"]
isOneToOne: false
      referencedRelation: "source_records"
      referencedColumns: ["id"]
    }
                  ]
                },"source_usage_daily": {
                  Row: {
                    "requests": number,"source_id": string,"updated_at": string,"usage_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "requests"?: number,"source_id": string,"updated_at"?: string,"usage_date": string
                  }
                  Update: {
                    "requests"?: number,"source_id"?: string,"updated_at"?: string,"usage_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_usage_daily_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "access_method": Database["public"]['Enums']["source_access_method"],"base_url": string | null,"created_at": string,"default_reliability_level": number,"id": string,"integration_status": Database["public"]['Enums']["source_integration_status"],"is_enabled": boolean,"last_error_at": string | null,"last_error_code": string | null,"last_sync_at": string | null,"name": string,"quota_per_day": number | null,"rate_limit_per_minute": number | null,"source_key": string,"source_type": Database["public"]['Enums']["source_type"],"storage_policy": Database["public"]['Enums']["source_storage_policy"],"terms_review_notes": string | null,"terms_reviewed_at": string | null,"terms_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_method": Database["public"]['Enums']["source_access_method"],"base_url"?: string | null,"created_at"?: string,"default_reliability_level": number,"id"?: string,"integration_status"?: Database["public"]['Enums']["source_integration_status"],"is_enabled"?: boolean,"last_error_at"?: string | null,"last_error_code"?: string | null,"last_sync_at"?: string | null,"name": string,"quota_per_day"?: number | null,"rate_limit_per_minute"?: number | null,"source_key": string,"source_type": Database["public"]['Enums']["source_type"],"storage_policy"?: Database["public"]['Enums']["source_storage_policy"],"terms_review_notes"?: string | null,"terms_reviewed_at"?: string | null,"terms_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_method"?: Database["public"]['Enums']["source_access_method"],"base_url"?: string | null,"created_at"?: string,"default_reliability_level"?: number,"id"?: string,"integration_status"?: Database["public"]['Enums']["source_integration_status"],"is_enabled"?: boolean,"last_error_at"?: string | null,"last_error_code"?: string | null,"last_sync_at"?: string | null,"name"?: string,"quota_per_day"?: number | null,"rate_limit_per_minute"?: number | null,"source_key"?: string,"source_type"?: Database["public"]['Enums']["source_type"],"storage_policy"?: Database["public"]['Enums']["source_storage_policy"],"terms_review_notes"?: string | null,"terms_reviewed_at"?: string | null,"terms_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tag_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string,"generated_opportunity_id": string | null,"id": string,"product_id": string | null,"tag_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by": string,"generated_opportunity_id"?: string | null,"id"?: string,"product_id"?: string | null,"tag_id": string,"workspace_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string,"generated_opportunity_id"?: string | null,"id"?: string,"product_id"?: string | null,"tag_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tag_assignment_opportunity_fk"
      columns: ["generated_opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "generated_opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "tag_assignments_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tag_assignments_tag_id_workspace_id_fkey"
      columns: ["tag_id","workspace_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string | null,"created_at": string,"created_by": string,"id": string,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"name": string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "invited_by": string | null,"joined_at": string,"role": Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "invited_by"?: string | null,"joined_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "invited_by"?: string | null,"joined_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_product_states": {
                  Row: {
                    "is_favorite": boolean,"is_hidden": boolean,"last_viewed_at": string | null,"personal_notes": string | null,"product_id": string,"status": Database["public"]['Enums']["opportunity_status"],"updated_at": string,"updated_by": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_favorite"?: boolean,"is_hidden"?: boolean,"last_viewed_at"?: string | null,"personal_notes"?: string | null,"product_id": string,"status"?: Database["public"]['Enums']["opportunity_status"],"updated_at"?: string,"updated_by": string,"workspace_id": string
                  }
                  Update: {
                    "is_favorite"?: boolean,"is_hidden"?: boolean,"last_viewed_at"?: string | null,"personal_notes"?: string | null,"product_id"?: string,"status"?: Database["public"]['Enums']["opportunity_status"],"updated_at"?: string,"updated_by"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_product_states_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "saas_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_product_states_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_settings": {
                  Row: {
                    "ai_preferences": NonNullable<Json>,"research_preferences": NonNullable<Json>,"updated_at": string,"updated_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_preferences"?: NonNullable<Json>,"research_preferences"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "ai_preferences"?: NonNullable<Json>,"research_preferences"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_settings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "catalog_count":
{ Args: { "p_plan": Json,"p_workspace_id": string }; Returns: number
                           },
"catalog_count_v2":
{ Args: { "p_plan": Json,"p_workspace_id": string }; Returns: number
                           },
"catalog_discover_metadata":
{ Args: { "p_product_ids": (string)[] }; Returns: {
              "acquisition_channels": Json,"product_id": string,"visual_asset": Json
            }[]
                           },
"catalog_search":
{ Args: { "p_after_id"?: string,"p_after_value"?: number,"p_limit"?: number,"p_plan": Json,"p_seed"?: number,"p_sort"?: string,"p_workspace_id": string }; Returns: {
              "billing_models": (Database["public"]['Enums']["billing_model"])[],"categories": Json,"country_code": string,"customer_type": Database["public"]['Enums']["customer_type"],"employee_max": number,"employee_min": number,"id": string,"in_collection": boolean,"is_favorite": boolean,"is_hidden": boolean,"last_viewed_at": string,"logo_url": string,"name": string,"pricing_status": Database["public"]['Enums']["pricing_status"],"short_description": string,"slug": string,"sort_value": string,"start_year": number,"tagline": string,"website_url": string,"workspace_status": Database["public"]['Enums']["opportunity_status"]
            }[]
                           },
"catalog_search_v2":
{ Args: { "p_after_id"?: string,"p_after_value"?: number,"p_limit"?: number,"p_plan": Json,"p_seed"?: number,"p_sort"?: string,"p_workspace_id": string }; Returns: {
              "billing_models": (Database["public"]['Enums']["billing_model"])[],"categories": Json,"country_code": string,"customer_type": Database["public"]['Enums']["customer_type"],"employee_max": number,"employee_min": number,"id": string,"in_collection": boolean,"is_favorite": boolean,"is_hidden": boolean,"last_viewed_at": string,"logo_url": string,"name": string,"pricing_status": Database["public"]['Enums']["pricing_status"],"short_description": string,"slug": string,"sort_value": string,"start_year": number,"tagline": string,"website_url": string,"workspace_status": Database["public"]['Enums']["opportunity_status"]
            }[]
                           },
"create_workspace":
{ Args: { "p_name": string }; Returns: string
                           },
"sor_add_member_by_email":
{ Args: { "p_actor": string,"p_email": string,"p_role": Database["public"]['Enums']["workspace_role"],"p_workspace_id": string }; Returns: string
                           },
"sor_admit_visual_asset":
{ Args: { "p_asset": Json,"p_content": string,"p_operator": string,"p_product_id": string }; Returns: Json
                           },
"sor_analysis_add_evidence":
{ Args: { "p_analysis_id": string,"p_evidence_ids": (string)[],"p_step_id": string }; Returns: number
                           },
"sor_analysis_finalize":
{ Args: { "p_analysis_id": string,"p_result": Json }; Returns: undefined
                           },
"sor_analysis_finish_pain_run":
{ Args: { "p_analysis_id": string,"p_status": Database["public"]['Enums']["run_status"] }; Returns: undefined
                           },
"sor_analysis_needs_review":
{ Args: { "p_analysis_id": string,"p_limitations": Json }; Returns: undefined
                           },
"sor_analysis_pain_run":
{ Args: { "p_analysis_id": string,"p_max_feedback_items": number }; Returns: string
                           },
"sor_apply_enrichment":
{ Args: { "p_job_id": string,"p_plan": Json,"p_product_id": string,"p_step_id": string }; Returns: Json
                           },
"sor_cancel_job":
{ Args: { "p_actor": string,"p_job_id": string,"p_workspace_id": string }; Returns: Database["public"]['Enums']["job_state"]
                           },
"sor_catalog_record_review":
{ Args: { "p_candidates": (string)[],"p_exclusion": Json,"p_reason": string,"p_row": Json }; Returns: string
                           },
"sor_catalog_refresh_statistics":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"sor_cluster_correction":
{ Args: { "p_actor": string,"p_cluster_id": string,"p_correction": Json,"p_expected_updated_at": string,"p_request_id": string,"p_stats": Json,"p_target_stats": Json,"p_workspace_id": string }; Returns: Json
                           },
"sor_consume_rate_limit":
{ Args: { "p_action": string,"p_subject": string }; Returns: number
                           },
"sor_delete_analysis":
{ Args: { "p_actor": string,"p_analysis_id": string,"p_request_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"sor_delete_discovery_run":
{ Args: { "p_actor": string,"p_request_id": string,"p_run_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"sor_delete_pain_point_run":
{ Args: { "p_actor": string,"p_request_id": string,"p_run_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"sor_discovery_finalize":
{ Args: { "p_run_id": string,"p_summary": Json }; Returns: undefined
                           },
"sor_discovery_save_plan":
{ Args: { "p_interpreted_filters": Json,"p_limitations": Json,"p_query_plan": Json,"p_run_id": string }; Returns: undefined
                           },
"sor_discovery_set_stage":
{ Args: { "p_run_id": string,"p_stage": string }; Returns: undefined
                           },
"sor_discovery_upsert_candidate":
{ Args: { "p_candidate": Json,"p_run_id": string }; Returns: Json
                           },
"sor_import_feedback_row":
{ Args: { "p_job_id": string,"p_product_id": string,"p_row": Json }; Returns: Json
                           },
"sor_import_product_row":
{ Args: { "p_decision": Json,"p_exclusion": Json,"p_job_id": string,"p_row": Json,"p_row_index": number }; Returns: Json
                           },
"sor_ingest_catalog_listing":
{ Args: { "p_decision": Json,"p_exclusion": Json,"p_row": Json }; Returns: Json
                           },
"sor_manual_add_product":
{ Args: { "p_entry": Json,"p_exclusion": Json,"p_requested_by": string,"p_workspace_id": string }; Returns: Json
                           },
"sor_operator_exclusion_decision":
{ Args: { "p_decision": Database["public"]['Enums']["exclusion_status"],"p_operator": string,"p_product_id": string,"p_reason": string }; Returns: undefined
                           },
"sor_operator_record_acquisition_channel":
{ Args: { "p_claim": Json,"p_operator": string,"p_product_id": string }; Returns: string
                           },
"sor_operator_remove_visual_asset":
{ Args: { "p_asset_id": string,"p_operator": string,"p_reason": string }; Returns: undefined
                           },
"sor_operator_resolve_catalog_review":
{ Args: { "p_action": string,"p_note"?: string,"p_operator": string,"p_product_id"?: string,"p_review_id": string }; Returns: Json
                           },
"sor_operator_resolve_report":
{ Args: { "p_note": string,"p_operator": string,"p_report_id": string,"p_status": string }; Returns: undefined
                           },
"sor_operator_retract_acquisition_channel":
{ Args: { "p_channel_id": string,"p_operator": string,"p_reason": string }; Returns: undefined
                           },
"sor_ops_snapshot":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"sor_ops_sync_alerts":
{ Args: { "p_alerts": Json }; Returns: Json
                           },
"sor_pain_mark_duplicates":
{ Args: { "p_pairs": Json }; Returns: number
                           },
"sor_pain_save_clusters":
{ Args: { "p_clusters": Json,"p_run_id": string }; Returns: number
                           },
"sor_pain_save_embeddings":
{ Args: { "p_rows": Json }; Returns: number
                           },
"sor_pain_save_insights":
{ Args: { "p_gaps": Json,"p_opportunities": Json,"p_run_id": string }; Returns: Json
                           },
"sor_pain_save_problems":
{ Args: { "p_contract_version": string,"p_feedback_id": string,"p_problems": Json,"p_prompt_version": string,"p_step_id": string }; Returns: string[]
                           },
"sor_record_snapshot":
{ Args: { "p_canonical_url": string,"p_content_hash": string,"p_external_id": string,"p_fetch_status": Database["public"]['Enums']["fetch_status"],"p_http_status": number,"p_metadata": Json,"p_published_at": string,"p_retrieved_at": string,"p_source_key": string,"p_storage_status": Database["public"]['Enums']["content_storage_status"],"p_title": string }; Returns: string
                           },
"sor_record_visual_asset_check":
{ Args: { "p_asset_id": string,"p_content_hash"?: string,"p_result": string }; Returns: string
                           },
"sor_record_visual_reference":
{ Args: { "p_ref": Json }; Returns: Json
                           },
"sor_request_analysis":
{ Args: { "p_analysis_type": Database["public"]['Enums']["analysis_type"],"p_idempotency_key": string,"p_request": Json,"p_request_hash": string,"p_requested_by": string,"p_subject": Json,"p_workspace_id": string }; Returns: {
              "analysis_id": string,"created": boolean,"job_id": string
            }[]
                           },
"sor_request_discovery_run":
{ Args: { "p_idempotency_key": string,"p_request": Json,"p_request_hash": string,"p_requested_by": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string,"run_id": string
            }[]
                           },
"sor_request_job":
{ Args: { "p_idempotency_key": string,"p_kind": Database["public"]['Enums']["job_kind"],"p_payload": Json,"p_request_hash": string,"p_requested_by": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string
            }[]
                           },
"sor_request_pain_point_run":
{ Args: { "p_category_id": string,"p_idempotency_key": string,"p_parameters": Json,"p_product_ids": (string)[],"p_request_hash": string,"p_requested_by": string,"p_scope_type": Database["public"]['Enums']["pain_scope_type"],"p_title": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string,"run_id": string
            }[]
                           },
"sor_retire_generic_visual_references":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"sor_retry_analysis":
{ Args: { "p_actor": string,"p_analysis_id": string,"p_idempotency_key": string,"p_request_hash": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string
            }[]
                           },
"sor_retry_discovery_run":
{ Args: { "p_actor": string,"p_idempotency_key": string,"p_request_hash": string,"p_run_id": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string
            }[]
                           },
"sor_retry_pain_point_run":
{ Args: { "p_actor": string,"p_idempotency_key": string,"p_request_hash": string,"p_run_id": string,"p_workspace_id": string }; Returns: {
              "created": boolean,"job_id": string
            }[]
                           },
"sor_review_discovery_candidate":
{ Args: { "p_actor": string,"p_candidate_id": string,"p_decision": string,"p_reason": string,"p_request_id": string,"p_workspace_id": string }; Returns: Json
                           },
"sor_save_report_export":
{ Args: { "p_content": string,"p_content_type": string,"p_filename": string,"p_format": string,"p_job_id": string }; Returns: string
                           },
"sor_source_consume":
{ Args: { "p_requests": number,"p_source_key": string }; Returns: boolean
                           },
"sor_step_start":
{ Args: { "p_agent_key": string,"p_attempt": number,"p_contract_version": string,"p_input_hash": string,"p_job_id": string,"p_prompt_version": string,"p_step_key": string,"p_worker_id": string }; Returns: string
                           },
"sor_transfer_ownership":
{ Args: { "p_current_owner": string,"p_new_owner": string,"p_workspace_id": string }; Returns: undefined
                           },
"sor_worker_claim":
{ Args: { "p_job_id": string,"p_lease_seconds": number,"p_worker_id": string }; Returns: {
              "attempt_count": number,
"budget": NonNullable<Json>,
"cancel_requested_at": string | null,
"completed_at": string | null,
"created_at": string,
"heartbeat_at": string | null,
"id": string,
"idempotency_key": string,
"job_kind": Database["public"]['Enums']["job_kind"],
"last_error_code": string | null,
"last_error_message": string | null,
"lease_expires_at": string | null,
"lease_owner": string | null,
"max_attempts": number,
"next_attempt_at": string | null,
"payload": NonNullable<Json>,
"queue_message_id": number | null,
"request_hash": string,
"requested_by": string | null,
"result": NonNullable<Json>,
"started_at": string | null,
"state": Database["public"]['Enums']["job_state"],
"terminal_reason": Database["public"]['Enums']["terminal_reason"] | null,
"usage": NonNullable<Json>,
"workspace_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "job_executions"
        isOneToOne: false
        isSetofReturn: true
      } },
"sor_worker_finish":
{ Args: { "p_error_code": string,"p_error_message": string,"p_job_id": string,"p_result"?: Json,"p_state": Database["public"]['Enums']["job_state"],"p_terminal_reason": Database["public"]['Enums']["terminal_reason"],"p_usage"?: Json,"p_worker_id": string }; Returns: undefined
                           },
"sor_worker_finish_poison":
{ Args: { "p_message_id": number,"p_reason": string }; Returns: undefined
                           },
"sor_worker_heartbeat":
{ Args: { "p_job_id": string,"p_lease_seconds": number,"p_message_id": number,"p_worker_id": string }; Returns: boolean
                           },
"sor_worker_read":
{ Args: { "p_qty": number,"p_vt_seconds": number }; Returns: {
              "message": Json,"msg_id": number,"read_ct": number
            }[]
                           },
"sor_worker_release":
{ Args: { "p_job_id": string,"p_reason": string,"p_worker_id": string }; Returns: undefined
                           },
"sor_worker_requeue_orphans":
{ Args: { "p_older_than_seconds": number }; Returns: number
                           },
"sor_worker_retry":
{ Args: { "p_delay_seconds": number,"p_error_code": string,"p_error_message": string,"p_job_id": string,"p_worker_id": string }; Returns: undefined
                           },
"sor_workspace_usage":
{ Args: { "p_user_id": string,"p_workspace_id": string }; Returns: Json
                           },
"workspace_member_directory":
{ Args: { "p_workspace_id": string }; Returns: {
              "email": string,"joined_at": string,"role": Database["public"]['Enums']["workspace_role"],"user_id": string
            }[]
                           }
          }
          Enums: {
            "analysis_subject_type": "product"|"product_set"|"category"|"pain_point_cluster"|"generated_opportunity","analysis_type": "opportunity"|"comparison","analysis_verdict": "build_candidate"|"validate_first"|"reject","assessment_status": "assessed"|"insufficient_evidence","billing_model": "monthly_subscription"|"annual_subscription"|"freemium"|"free_trial"|"usage_based"|"per_user"|"volume_based"|"license"|"other","claim_type": "product_exists"|"product_description"|"category"|"pricing"|"paid_customer_signal"|"customer_identity"|"employee_count"|"founding_year"|"headquarters"|"customer_country"|"market_presence"|"language"|"platform"|"feature"|"integration"|"maturity"|"company_profile"|"traction_signal"|"customer_feedback"|"customer_pain"|"market_size"|"market_trend"|"competitor_relation"|"localization"|"funding"|"traffic"|"other"|"acquisition_channel"|"visual_asset","cluster_review_status": "machine_proposed"|"user_confirmed"|"user_corrected"|"rejected","company_type": "independent"|"subsidiary"|"public_company"|"unknown","competitor_relationship": "direct"|"indirect"|"alternative"|"substitute"|"adjacent","content_storage_status": "stored_full"|"stored_excerpt"|"reference_only"|"removed","count_status": "verified"|"estimated"|"unknown","customer_type": "b2b"|"b2c"|"b2b_b2c"|"unknown","decision_band": "reject"|"low_potential"|"to_investigate"|"interesting"|"priority","dimension_key": "customer_demand"|"willingness_to_pay"|"product_gap"|"market_attractiveness"|"competitive_differentiation"|"feasibility_distribution","evidence_type": "official_statement"|"customer_review"|"pricing_evidence"|"customer_case_study"|"public_metric"|"technical_evidence"|"market_evidence"|"third_party_report"|"user_declared"|"inference","exclusion_status": "unassessed"|"eligible"|"excluded"|"needs_review","extraction_method": "official_api"|"structured_parse"|"llm_extraction"|"manual_entry"|"user_import","fact_status": "confirmed"|"estimated"|"declared"|"unknown","feature_availability": "available"|"beta"|"planned"|"removed"|"not_observed"|"unknown","fetch_status": "ok"|"blocked"|"unavailable"|"not_supported"|"rate_limited"|"error","finding_type": "pain_point"|"opportunity"|"risk"|"competitor_gap"|"recommendation"|"kill_criterion","frequency_label": "isolated"|"recurring"|"widespread"|"unknown","funding_status": "bootstrapped"|"externally_funded"|"unknown","integration_category": "crm"|"ecommerce"|"marketing"|"analytics"|"communication"|"payments"|"other","job_kind": "product_enrichment"|"product_refresh"|"source_sync"|"catalog_import"|"feedback_import"|"discovery_run"|"pain_point_run"|"opportunity_analysis"|"report_export"|"data_export","job_state": "queued"|"running"|"retrying"|"completed"|"partial"|"failed"|"cancelled"|"dead_letter","kill_severity": "critical"|"major"|"minor","maturity_stage": "new"|"launching"|"established"|"growing"|"mature"|"unknown","monetization_signal": "payment_confirmed"|"customer_verified"|"paid_plan_available"|"purchase_intent"|"problem_signal"|"unknown","opportunity_status": "discovered"|"to_research"|"analyzing"|"validate"|"validated"|"rejected"|"building","pain_scope_type": "product"|"product_set"|"category","presence_status": "present"|"not_observed"|"unknown","pricing_status": "free"|"paid"|"freemium"|"custom"|"unknown","problem_category": "pricing"|"ux"|"missing_features"|"bugs"|"support"|"integrations"|"performance"|"documentation"|"customization"|"complexity"|"reliability"|"other","product_status": "active"|"beta"|"discontinued"|"unknown","record_status": "candidate"|"active"|"needs_review"|"archived"|"merged","resolution_status": "resolved"|"unresolved"|"unknown","review_sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown","run_status": "queued"|"running"|"completed"|"partial"|"failed"|"cancelled"|"needs_review","source_access_method": "official_api"|"contract"|"public_feed"|"official_website_fetch"|"manual_entry"|"user_import","source_integration_status": "planned"|"in_development"|"integrated"|"disabled"|"blocked","source_storage_policy": "full"|"metadata_only"|"transient","source_type": "official_website"|"review_platform"|"directory"|"community"|"social"|"company_database"|"search_provider"|"manual_entry"|"user_import"|"other","switching_intent": "stated"|"not_stated"|"unknown","technology_tag": "web_app"|"mobile_app"|"api"|"ai_native"|"no_code_low_code"|"browser_extension","terminal_reason": "completed"|"partial"|"failed"|"cancelled"|"dead_letter"|"budget_exhausted","verification_status": "unverified"|"verified"|"needs_review"|"rejected"|"stale","workspace_role": "owner"|"admin"|"member"|"viewer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "analysis_subject_type": ["product", "product_set", "category", "pain_point_cluster", "generated_opportunity"],"analysis_type": ["opportunity", "comparison"],"analysis_verdict": ["build_candidate", "validate_first", "reject"],"assessment_status": ["assessed", "insufficient_evidence"],"billing_model": ["monthly_subscription", "annual_subscription", "freemium", "free_trial", "usage_based", "per_user", "volume_based", "license", "other"],"claim_type": ["product_exists", "product_description", "category", "pricing", "paid_customer_signal", "customer_identity", "employee_count", "founding_year", "headquarters", "customer_country", "market_presence", "language", "platform", "feature", "integration", "maturity", "company_profile", "traction_signal", "customer_feedback", "customer_pain", "market_size", "market_trend", "competitor_relation", "localization", "funding", "traffic", "other", "acquisition_channel", "visual_asset"],"cluster_review_status": ["machine_proposed", "user_confirmed", "user_corrected", "rejected"],"company_type": ["independent", "subsidiary", "public_company", "unknown"],"competitor_relationship": ["direct", "indirect", "alternative", "substitute", "adjacent"],"content_storage_status": ["stored_full", "stored_excerpt", "reference_only", "removed"],"count_status": ["verified", "estimated", "unknown"],"customer_type": ["b2b", "b2c", "b2b_b2c", "unknown"],"decision_band": ["reject", "low_potential", "to_investigate", "interesting", "priority"],"dimension_key": ["customer_demand", "willingness_to_pay", "product_gap", "market_attractiveness", "competitive_differentiation", "feasibility_distribution"],"evidence_type": ["official_statement", "customer_review", "pricing_evidence", "customer_case_study", "public_metric", "technical_evidence", "market_evidence", "third_party_report", "user_declared", "inference"],"exclusion_status": ["unassessed", "eligible", "excluded", "needs_review"],"extraction_method": ["official_api", "structured_parse", "llm_extraction", "manual_entry", "user_import"],"fact_status": ["confirmed", "estimated", "declared", "unknown"],"feature_availability": ["available", "beta", "planned", "removed", "not_observed", "unknown"],"fetch_status": ["ok", "blocked", "unavailable", "not_supported", "rate_limited", "error"],"finding_type": ["pain_point", "opportunity", "risk", "competitor_gap", "recommendation", "kill_criterion"],"frequency_label": ["isolated", "recurring", "widespread", "unknown"],"funding_status": ["bootstrapped", "externally_funded", "unknown"],"integration_category": ["crm", "ecommerce", "marketing", "analytics", "communication", "payments", "other"],"job_kind": ["product_enrichment", "product_refresh", "source_sync", "catalog_import", "feedback_import", "discovery_run", "pain_point_run", "opportunity_analysis", "report_export", "data_export"],"job_state": ["queued", "running", "retrying", "completed", "partial", "failed", "cancelled", "dead_letter"],"kill_severity": ["critical", "major", "minor"],"maturity_stage": ["new", "launching", "established", "growing", "mature", "unknown"],"monetization_signal": ["payment_confirmed", "customer_verified", "paid_plan_available", "purchase_intent", "problem_signal", "unknown"],"opportunity_status": ["discovered", "to_research", "analyzing", "validate", "validated", "rejected", "building"],"pain_scope_type": ["product", "product_set", "category"],"presence_status": ["present", "not_observed", "unknown"],"pricing_status": ["free", "paid", "freemium", "custom", "unknown"],"problem_category": ["pricing", "ux", "missing_features", "bugs", "support", "integrations", "performance", "documentation", "customization", "complexity", "reliability", "other"],"product_status": ["active", "beta", "discontinued", "unknown"],"record_status": ["candidate", "active", "needs_review", "archived", "merged"],"resolution_status": ["resolved", "unresolved", "unknown"],"review_sentiment": ["positive", "neutral", "negative", "mixed", "unknown"],"run_status": ["queued", "running", "completed", "partial", "failed", "cancelled", "needs_review"],"source_access_method": ["official_api", "contract", "public_feed", "official_website_fetch", "manual_entry", "user_import"],"source_integration_status": ["planned", "in_development", "integrated", "disabled", "blocked"],"source_storage_policy": ["full", "metadata_only", "transient"],"source_type": ["official_website", "review_platform", "directory", "community", "social", "company_database", "search_provider", "manual_entry", "user_import", "other"],"switching_intent": ["stated", "not_stated", "unknown"],"technology_tag": ["web_app", "mobile_app", "api", "ai_native", "no_code_low_code", "browser_extension"],"terminal_reason": ["completed", "partial", "failed", "cancelled", "dead_letter", "budget_exhausted"],"verification_status": ["unverified", "verified", "needs_review", "rejected", "stale"],"workspace_role": ["owner", "admin", "member", "viewer"]
          }
        }
} as const
