// Liveness watchdog (Sprint 7; PD-27: a Render background worker has no
// health check, so the process must exit on its own when it stops making
// progress, and Render restarts it).
//
// Two failure modes are covered:
// 1. Blocked event loop (a synchronous hang): the main thread stops sending
//    pings; a separate thread notices and kills the process. Running in a
//    worker thread is what makes this detection possible at all.
// 2. Stalled progress: the main thread checks that the polling loop or a
//    job heartbeat made progress recently; otherwise it exits.
// Exiting is safe: leases expire, the job is recovered and completed agent
// steps are reused (crash recovery is covered by the integration tests).
import { Worker as Thread } from "node:worker_threads";

export interface WatchdogOptions {
  /** Kill the process if the event loop does not answer for this long. */
  blockedMs: number;
  /** Exit if neither the loop nor a job heartbeat progressed for this long. */
  stalledMs: number;
  /** Milliseconds since the last progress (Worker.msSinceProgress). */
  msSinceProgress: () => number;
  log: (entry: Record<string, unknown>) => void;
  /** Exit hook (tests replace it). */
  exit?: (code: number) => void;
  pingMs?: number;
}

// The thread writes straight to fd 2 (the main thread may be blocked) and
// kills the process with SIGKILL, which no blocked loop can delay.
const THREAD_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { writeSync } = require("node:fs");
let last = Date.now();
parentPort.on("message", () => { last = Date.now(); });
setInterval(() => {
  const age = Date.now() - last;
  if (age > workerData.blockedMs) {
    writeSync(2, JSON.stringify({ ts: new Date().toISOString(), level: "fatal",
      msg: "watchdog: event loop blocked, killing the worker", blocked_ms: age }) + "\\n");
    process.kill(process.pid, "SIGKILL");
  }
}, Math.min(5000, Math.max(250, Math.floor(workerData.blockedMs / 4))));
`;

export interface WatchdogHandle {
  stop(): void;
}

export function startWatchdog(options: WatchdogOptions): WatchdogHandle {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const pingMs = options.pingMs ?? Math.min(5000, Math.max(100, Math.floor(options.blockedMs / 6)));
  const thread = new Thread(THREAD_SOURCE, {
    eval: true,
    workerData: { blockedMs: options.blockedMs },
  });
  thread.unref();
  const timer = setInterval(() => {
    thread.postMessage(0);
    const idle = options.msSinceProgress();
    if (idle > options.stalledMs) {
      options.log({
        level: "fatal",
        msg: "watchdog: no progress, exiting for a restart",
        idle_ms: idle,
      });
      exit(1);
    }
  }, pingMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
      void thread.terminate();
    },
  };
}
