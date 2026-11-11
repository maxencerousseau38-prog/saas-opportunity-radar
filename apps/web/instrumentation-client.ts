// Runs in the browser before the application code (Next.js instrumentation-client).
//
// S8.1: when a Zod schema is first built in the browser (e.g. the Discover
// filter panel), Zod's JIT probes `new Function("")`. The enforced Content
// Security Policy has no 'unsafe-eval' (PD-33), so the browser blocks the
// probe and reports a `securitypolicyviolation` (DevTools issue) even though
// Zod catches the error. `jitless` skips the probe; validation is unchanged.
// Browser only: the server keeps Zod's JIT, and the policy is not weakened.
import { z } from "zod";

z.config({ jitless: true });
