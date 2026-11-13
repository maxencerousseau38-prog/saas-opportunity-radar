"use client";
// Feed signals (PD-41): the cards actually seen on screen (at least 60 %
// visible) and the profiles opened from the feed, sent in small batches to
// the workspace's own ranking. Members and above only; best effort (a lost
// batch only makes a card come back sooner). Nothing about the user leaves
// SOR: the signals stay in the workspace.
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from "react";

const FLUSH_MS = 4_000;
const MAX_SHOWN = 100;

export function useFeedSignals(options: {
  workspaceId: string;
  enabled: boolean;
  container: RefObject<HTMLElement | null>;
  /** Server-assigned start of the current feed session, null until the first page answers. */
  startedAt: () => string | null;
  /** Re-scan the cards when this changes (new page, new view). */
  revision: unknown;
  onActivity: () => void;
}) {
  const { workspaceId, enabled, container, startedAt, revision, onActivity } = options;
  const pending = useRef({ shown: new Set<string>(), opened: new Set<string>() });
  const recorded = useRef({ session: "", shown: new Set<string>(), opened: new Set<string>() });
  const observer = useRef<IntersectionObserver | null>(null);

  const flush = useCallback(
    (keepalive = false) => {
      const session = startedAt();
      if (!enabled || !session) return;
      if (recorded.current.session !== session) {
        recorded.current = { session, shown: new Set(), opened: new Set() };
      }
      const shown = [...pending.current.shown].filter((id) => !recorded.current.shown.has(id));
      const opened = [...pending.current.opened].filter((id) => !recorded.current.opened.has(id));
      pending.current = { shown: new Set(), opened: new Set() };
      for (let i = 0; i < Math.max(shown.length, opened.length ? 1 : 0); i += MAX_SHOWN) {
        const batch = { shown: shown.slice(i, i + MAX_SHOWN), opened: i === 0 ? opened : [] };
        if (!batch.shown.length && !batch.opened.length) continue;
        for (const id of batch.shown) recorded.current.shown.add(id);
        for (const id of batch.opened) recorded.current.opened.add(id);
        void fetch(`/api/v1/workspaces/${workspaceId}/feed/signals`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          keepalive,
          body: JSON.stringify({ feed_started_at: session, ...batch }),
        }).catch(() => {
          // Best effort: the next session may show the card again.
        });
      }
    },
    [enabled, startedAt, workspaceId],
  );

  // Cards seen on screen.
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.productId;
          if (id && e.isIntersecting && e.intersectionRatio >= 0.6) {
            pending.current.shown.add(id);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: [0.6] },
    );
    observer.current = io;
    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    const io = observer.current;
    const root = container.current;
    if (!io || !root) return;
    for (const el of root.querySelectorAll<HTMLElement>("article[data-product-id]")) {
      if (!recorded.current.shown.has(el.dataset.productId ?? "")) io.observe(el);
    }
  }, [container, revision, enabled]);

  // Batches every few seconds, and before the page goes away.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (pending.current.shown.size || pending.current.opened.size) {
        onActivity();
        flush();
      }
    }, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [enabled, flush, onActivity]);

  /** A tap that opens a profile from the feed (capture phase, before navigation). */
  const onClickCapture = useCallback(
    (event: MouseEvent) => {
      if (!enabled) return;
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>("a[href*='/saas/']");
      const card = target.closest<HTMLElement>("article[data-product-id]");
      const id = card?.dataset.productId;
      if (!link || !id) return;
      pending.current.opened.add(id);
      pending.current.shown.add(id);
      onActivity();
      flush(true);
    },
    [enabled, flush, onActivity],
  );

  return { onClickCapture };
}
