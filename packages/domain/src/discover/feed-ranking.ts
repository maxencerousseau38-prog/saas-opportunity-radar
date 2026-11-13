// Discover feed renewal, rule `feed-1` (PD-41, product-owner instruction of
// 13 November 2026: "à chaque ouverture de la plateforme, la découverte doit
// être renouvelée intelligemment : nouveaux SaaS en priorité, SaaS déjà
// consultés moins souvent, sans répétitions inutiles").
//
// The score is computed by the database for every visible product (the
// "Pour vous" sort, sort key `discovery`) so that the keyset pagination covers
// the whole catalogue; `private.feed_score` mirrors this function exactly and
// pgTAP 030 checks both against the same fixed cases. Everything is relative
// to the start of the feed session (`asOf`), never to the wall clock, so that
// one session keeps one stable order while the user scrolls and comes back.
//
// No AI and no popularity: only the workspace's own signals (cards shown in
// its feed, profiles it opened) and the catalogue date of each product.

export const FEED_RULES_VERSION = "feed-1";

/** A new feed session starts at each opening, or after this much inactivity. */
export const FEED_SESSION_IDLE_MINUTES = 30;
/** The server never ranks against a session older than this. */
export const FEED_SESSION_MAX_HOURS = 24;

export const FEED_WEIGHTS = {
  /** Bonus of a product the workspace has never been shown nor opened. */
  unseenBonus: 0.5,
  /** Extra bonus of a catalogue addition, fading linearly over `noveltyDays`. */
  noveltyBonus: 1,
  noveltyDays: 14,
  /** Penalty of a card shown in an earlier session, fading over `shownDays`. */
  shownPenalty: 0.9,
  shownDays: 7,
  /** Small lasting penalty per earlier showing without opening (capped). */
  repeatPenalty: 0.08,
  repeatCap: 5,
  /** An opened profile comes back less often: a floor plus a fading part. */
  openedFloor: 0.4,
  openedPenalty: 1.2,
  openedDays: 30,
} as const;

export interface FeedSignals {
  /** Stable pseudo-random draw in [0, 1) for this product and session seed. */
  draw: number;
  /** Days between the product's arrival in the catalogue and the session start. */
  ageDays: number;
  /** Showings in earlier sessions (the current session never counts). */
  shownCount: number;
  /** Days since the last showing in an earlier session, null if never shown. */
  daysSinceShown: number | null;
  /** Days since the last opening before the session, null if never opened. */
  daysSinceOpened: number | null;
}

/** Linear fade from 1 (just now) to 0 (after `days`); negative ages count as now. */
function fade(daysAgo: number, days: number): number {
  return Math.max(0, 1 - Math.max(0, daysAgo) / days);
}

/**
 * Higher first. Ranges: never seen [0.5, 2.5), shown before [-1.3, 1),
 * opened before [-1.6, 0.6). The ranges overlap on purpose: a product seen
 * long ago can come back, just less often than one never seen.
 */
export function feedScore(s: FeedSignals): number {
  const w = FEED_WEIGHTS;
  if (s.daysSinceOpened !== null) {
    return s.draw - w.openedFloor - w.openedPenalty * fade(s.daysSinceOpened, w.openedDays);
  }
  if (s.shownCount > 0 && s.daysSinceShown !== null) {
    return (
      s.draw -
      w.shownPenalty * fade(s.daysSinceShown, w.shownDays) -
      w.repeatPenalty * Math.min(s.shownCount, w.repeatCap)
    );
  }
  return s.draw + w.unseenBonus + w.noveltyBonus * fade(s.ageDays, w.noveltyDays);
}

export interface FeedSession {
  seed: number;
  /** Server-assigned start (ISO), unknown until the first page answers. */
  startedAt: string | null;
  /** Last use in this tab (ISO, client clock: only compared with itself). */
  lastUsedAt: string;
}

/** Whether a stored session must give way to a new one (a new opening). */
export function feedSessionExpired(session: FeedSession | null, now: Date): boolean {
  if (!session) return true;
  const lastUsed = Date.parse(session.lastUsedAt);
  if (!Number.isFinite(lastUsed)) return true;
  return now.getTime() - lastUsed > FEED_SESSION_IDLE_MINUTES * 60_000;
}

/**
 * The session start the server ranks against: the one the client was given,
 * if it is plausible (not in the future beyond a minute of clock skew between
 * servers, not older than the maximum), otherwise a new session now.
 */
export function feedSessionStart(requested: string | undefined, now: Date): string {
  if (requested) {
    const t = Date.parse(requested);
    const maxAge = (FEED_SESSION_MAX_HOURS - 1) * 3_600_000;
    if (Number.isFinite(t) && t <= now.getTime() + 60_000 && t >= now.getTime() - maxAge) {
      return new Date(t).toISOString();
    }
  }
  return now.toISOString();
}
