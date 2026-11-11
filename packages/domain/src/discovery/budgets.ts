// Per-run Discovery budgets by depth (Implementation Blueprint §6.2 "Limit
// query count to the run budget", §11 budgets; docs/DATA_SOURCES.md controls).
// [ASSUMPTION] values proposed in the Sprint 6 plan (6 Nov 2026); token and
// cost budgets of the LLM steps come from PD-24a and are enforced by the
// AI gateway, not here.
import type { DiscoveryDepth } from "@sor/contracts";

export interface DiscoveryBudget {
  /** Planned queries kept per search source. */
  queries_per_source: number;
  /** Requests to one search source in the run (HN: lists + items). */
  search_requests_per_source: number;
  /** Leads kept across all channels, after de-duplication. */
  leads: number;
  /** Official-site pages fetched to build candidates (identity + extraction). */
  official_pages: number;
  /** Rebound: catalogued products used as seeds. */
  rebound_seeds: number;
  /** Rebound: allow-listed pages read per seed. */
  rebound_pages_per_seed: number;
  /** Rebound: external leads kept per seed. */
  rebound_leads_per_seed: number;
  /** D3 extraction calls (one per candidate official site). */
  extraction_calls: number;
}

export const DISCOVERY_BUDGETS: Readonly<Record<DiscoveryDepth, DiscoveryBudget>> = {
  standard: {
    queries_per_source: 5,
    search_requests_per_source: 300,
    leads: 60,
    official_pages: 90,
    rebound_seeds: 5,
    rebound_pages_per_seed: 3,
    rebound_leads_per_seed: 20,
    extraction_calls: 30,
  },
  deep: {
    queries_per_source: 10,
    search_requests_per_source: 1000,
    leads: 150,
    official_pages: 240,
    rebound_seeds: 15,
    rebound_pages_per_seed: 3,
    rebound_leads_per_seed: 20,
    extraction_calls: 80,
  },
};
