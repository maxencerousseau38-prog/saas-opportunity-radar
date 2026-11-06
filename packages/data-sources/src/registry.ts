// Code-side descriptors of the sources the Discovery Engine knows
// (docs/DATA_SOURCES.md). The database `sources` row stays the gate: a
// connector is called only when its row is `integrated` and enabled. These
// descriptors carry what the terms review decided, for the run report.
import type { SourceStoragePolicy } from "@sor/contracts/evidence";

export type DiscoveryChannel = "search" | "official_site_rebound" | "seed_url";

export interface SourceDescriptor {
  sourceKey: string;
  channel: DiscoveryChannel;
  storagePolicy: SourceStoragePolicy;
  /** PRD §13.2 level for the facts this source provides. */
  reliabilityLevel: 1 | 2 | 3 | 4;
  termsUrl: string | null;
}

export const DISCOVERY_SOURCES: Readonly<Record<string, SourceDescriptor>> = {
  hacker_news: {
    sourceKey: "hacker_news",
    channel: "search",
    storagePolicy: "metadata_only",
    reliabilityLevel: 3,
    termsUrl: "https://www.ycombinator.com/legal/",
  },
  official_website: {
    sourceKey: "official_website",
    channel: "official_site_rebound",
    storagePolicy: "full",
    reliabilityLevel: 1,
    termsUrl: null,
  },
  user_import: {
    sourceKey: "user_import",
    channel: "seed_url",
    storagePolicy: "full",
    reliabilityLevel: 4,
    termsUrl: null,
  },
};

/** Search sources in the order the planner may use them. */
export const SEARCH_SOURCE_KEYS: readonly string[] = Object.values(DISCOVERY_SOURCES)
  .filter((d) => d.channel === "search")
  .map((d) => d.sourceKey);
