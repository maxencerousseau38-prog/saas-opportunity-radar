import { describe, expect, it } from "vitest";
import {
  FEED_RULES_VERSION,
  feedScore,
  feedSessionExpired,
  feedSessionStart,
  type FeedSignals,
} from "../discover";

const base: FeedSignals = {
  draw: 0.25,
  ageDays: 30,
  shownCount: 0,
  daysSinceShown: null,
  daysSinceOpened: null,
};

// The same cases are asserted on private.feed_score in supabase/tests/030.
const PARITY: Array<[string, FeedSignals, number]> = [
  ["new addition never seen", { ...base, ageDays: 7 }, 1.25],
  ["older product never seen", base, 0.75],
  ["shown 3.5 days ago, twice", { ...base, shownCount: 2, daysSinceShown: 3.5 }, -0.36],
  ["shown long ago, many times", { ...base, shownCount: 7, daysSinceShown: 10 }, -0.15],
  [
    "opened 15 days ago",
    { ...base, shownCount: 1, daysSinceShown: 15, daysSinceOpened: 15 },
    -0.75,
  ],
  ["opened 60 days ago", { ...base, daysSinceOpened: 60 }, -0.15],
  ["opened 'in the future' (clock skew) counts as now", { ...base, daysSinceOpened: -1 }, -1.35],
];

describe(`feed ranking ${FEED_RULES_VERSION}`, () => {
  it.each(PARITY)("%s", (_label, signals, expected) => {
    expect(feedScore(signals)).toBeCloseTo(expected, 10);
  });

  it("puts every never-seen product above a card shown yesterday with the same draw", () => {
    const unseen = feedScore({ ...base, draw: 0 });
    const shown = feedScore({ ...base, draw: 0.99, shownCount: 1, daysSinceShown: 1 });
    expect(unseen).toBeGreaterThan(shown);
  });

  it("puts a recent catalogue addition above an older unseen product with the same draw", () => {
    expect(feedScore({ ...base, ageDays: 1 })).toBeGreaterThan(feedScore({ ...base, ageDays: 20 }));
  });

  it("brings opened products back less often than never-seen ones, but not never", () => {
    const openedLongAgo = feedScore({ ...base, draw: 0.99, daysSinceOpened: 90 });
    const unseenUnlucky = feedScore({ ...base, draw: 0.01 });
    expect(openedLongAgo).toBeGreaterThan(unseenUnlucky);
    expect(feedScore({ ...base, draw: 0.5, daysSinceOpened: 90 })).toBeLessThan(
      feedScore({ ...base, draw: 0.5 }),
    );
  });

  it("ranks an opened product below a merely shown one (same draw and age)", () => {
    const shown = feedScore({ ...base, shownCount: 1, daysSinceShown: 2 });
    const opened = feedScore({ ...base, shownCount: 1, daysSinceShown: 2, daysSinceOpened: 2 });
    expect(opened).toBeLessThan(shown);
  });

  it("caps the repeat penalty", () => {
    expect(feedScore({ ...base, shownCount: 5, daysSinceShown: 30 })).toBe(
      feedScore({ ...base, shownCount: 50, daysSinceShown: 30 }),
    );
  });
});

describe("feed session renewal", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  it("starts a new session at the first opening", () => {
    expect(feedSessionExpired(null, now)).toBe(true);
  });
  it("keeps the session while the user keeps using it", () => {
    expect(
      feedSessionExpired({ seed: 1, startedAt: null, lastUsedAt: "2026-11-13T11:45:00Z" }, now),
    ).toBe(false);
  });
  it("renews it after 30 minutes of inactivity or a corrupt value", () => {
    expect(
      feedSessionExpired({ seed: 1, startedAt: null, lastUsedAt: "2026-11-13T11:20:00Z" }, now),
    ).toBe(true);
    expect(feedSessionExpired({ seed: 1, startedAt: null, lastUsedAt: "nope" }, now)).toBe(true);
  });
});

describe("feed session start on the server", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  it("keeps a plausible start given by the client", () => {
    expect(feedSessionStart("2026-11-13T11:00:00.000Z", now)).toBe("2026-11-13T11:00:00.000Z");
    expect(feedSessionStart("2026-11-13T12:00:30.000Z", now)).toBe("2026-11-13T12:00:30.000Z");
  });
  it("starts a new session when absent, malformed, in the future or too old", () => {
    for (const bad of [undefined, "x", "2026-11-13T12:05:00.000Z", "2026-11-12T11:00:00.000Z"]) {
      expect(feedSessionStart(bad, now)).toBe(now.toISOString());
    }
  });
});
