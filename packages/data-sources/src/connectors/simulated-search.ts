// Simulated search connector for tests and labelled demo runs only. It
// returns fixed, SYNTHETIC results and never touches the network. Every
// result carries `metadata.simulated = 1` so it can never be mistaken for
// data from a real source.
import type { SourceDocument } from "@sor/contracts/evidence";
import {
  failure,
  type ConnectorCapabilities,
  type ConnectorOutcome,
  type SourceConnector,
  type SourceSearchRequest,
  type SourceSearchResult,
} from "../connector";

export interface SimulatedSearchOptions {
  sourceKey: string;
  /** Results per lower-cased query; a query not listed returns no result. */
  results: Record<string, Array<Omit<SourceSearchResult, "metadata">>>;
  /** Make every search fail with this outcome (outage tests). */
  failWith?: "unavailable" | "rate_limited" | "error";
}

export class SimulatedSearchConnector implements SourceConnector {
  readonly sourceKey: string;
  readonly calls: string[] = [];

  constructor(private readonly options: SimulatedSearchOptions) {
    this.sourceKey = options.sourceKey;
  }

  getCapabilities(): ConnectorCapabilities {
    return { search: true, fetchDocument: false, fetchReviews: false, officialSource: false };
  }

  async search(
    input: SourceSearchRequest,
    _signal: AbortSignal,
  ): Promise<ConnectorOutcome<SourceSearchResult[]>> {
    this.calls.push(input.query);
    if (this.options.failWith) {
      return failure(
        this.options.failWith,
        "simulated_outage",
        this.options.failWith !== "unavailable",
      );
    }
    const hits = this.options.results[input.query.trim().toLowerCase()] ?? [];
    return {
      status: "ok",
      data: hits.slice(0, input.limit).map((r) => ({ ...r, metadata: { simulated: 1 } })),
    };
  }

  async fetchDocument(): Promise<ConnectorOutcome<SourceDocument>> {
    return failure("not_supported", "the simulated search connector never fetches pages", false);
  }
}
