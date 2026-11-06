// Liveness watchdog (Sprint 7): exits when the worker stops making progress.
// The blocked-event-loop path kills the process with SIGKILL, so it is only
// exercised with a threshold that never fires here.
import { describe, expect, it } from "vitest";
import { startWatchdog } from "../watchdog";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("startWatchdog", () => {
  it("exits with a non-zero code when progress stalls", async () => {
    const exits: number[] = [];
    const logs: Array<Record<string, unknown>> = [];
    const w = startWatchdog({
      blockedMs: 600_000,
      stalledMs: 50,
      msSinceProgress: () => 10_000,
      log: (e) => logs.push(e),
      exit: (code) => exits.push(code),
      pingMs: 10,
    });
    await wait(60);
    w.stop();
    expect(exits[0]).toBe(1);
    expect(logs[0]).toMatchObject({
      level: "fatal",
      msg: "watchdog: no progress, exiting for a restart",
    });
  });

  it("stays quiet while the worker makes progress", async () => {
    const exits: number[] = [];
    const w = startWatchdog({
      blockedMs: 600_000,
      stalledMs: 1_000,
      msSinceProgress: () => 5,
      log: () => undefined,
      exit: (code) => exits.push(code),
      pingMs: 10,
    });
    await wait(60);
    w.stop();
    expect(exits).toEqual([]);
  });
});
