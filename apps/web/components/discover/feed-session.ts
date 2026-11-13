// Discover feed session in the browser (PD-41). One session per opening of
// the platform: a new tab or app launch, or a return after 30 minutes of
// inactivity (sessionStorage dies with the tab). The session keeps one seed
// and the server-assigned start, so the feed order stays the same while the
// user scrolls, opens a profile and comes back; the next opening reshuffles.
import { feedSessionExpired, type FeedSession } from "@sor/domain/feed";

const KEY = "sor.discover.feed-session";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

function read(): FeedSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FeedSession>;
    if (
      typeof v.seed !== "number" ||
      !Number.isInteger(v.seed) ||
      v.seed < 0 ||
      typeof v.lastUsedAt !== "string" ||
      (v.startedAt !== null && typeof v.startedAt !== "string")
    ) {
      return null;
    }
    return { seed: v.seed, startedAt: v.startedAt, lastUsedAt: v.lastUsedAt };
  } catch {
    return null;
  }
}

/** Persists the session; storage may be unavailable (private mode): then it lives in memory only. */
export function saveFeedSession(session: FeedSession): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Not persisted: a reload starts a new session, which is acceptable.
  }
}

/** The current session, or a new one if this is a new opening. */
export function openFeedSession(now = new Date()): FeedSession {
  const stored = read();
  const session: FeedSession =
    stored && !feedSessionExpired(stored, now)
      ? { ...stored, lastUsedAt: now.toISOString() }
      : { seed: randomSeed(), startedAt: null, lastUsedAt: now.toISOString() };
  saveFeedSession(session);
  return session;
}

/** Marks the session as used now (scrolling, opening a card). */
export function touchFeedSession(session: FeedSession, now = new Date()): void {
  session.lastUsedAt = now.toISOString();
  saveFeedSession(session);
}
