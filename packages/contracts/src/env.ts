// Environment validation (Implementation Blueprint §15 Sprint 0; Technical Blueprint §11.3).
// Error messages list variable names only, never values.
import { z } from "zod";
import { HttpUrlSchema } from "./common";

export const AppEnvSchema = z.enum(["local", "test", "staging", "production"]);

/** Variables that may be exposed to the browser (Next.js inlines NEXT_PUBLIC_*). */
export const WebPublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: HttpUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

/** Server-only variables of the web app (route handlers, server components). */
export const WebServerEnvSchema = WebPublicEnvSchema.extend({
  APP_ENV: AppEnvSchema.default("local"),
  SUPABASE_SECRET_KEY: z.string().min(20),
  /**
   * Public origin of the web app (e.g. https://radar.example.com), used for
   * links sent by email (invitations). Required in staging and production so
   * that a forged Host header can never shape a link (S7.4d); local and test
   * fall back to the request origin.
   */
  SITE_URL: HttpUrlSchema.optional(),
}).superRefine((env, ctx) => {
  if ((env.APP_ENV === "staging" || env.APP_ENV === "production") && !env.SITE_URL) {
    ctx.addIssue({
      code: "custom",
      path: ["SITE_URL"],
      message: "required in staging and production",
    });
  }
});

/** Variables of the persistent worker. */
export const WorkerEnvSchema = z.object({
  APP_ENV: AppEnvSchema.default("local"),
  SUPABASE_URL: HttpUrlSchema,
  SUPABASE_SECRET_KEY: z.string().min(20),
  WORKER_ID: z
    .string()
    .regex(/^[a-z0-9-]{3,64}$/)
    .optional(),
  /** Only the fake provider exists until the PD-24 benchmark chooses a real one. */
  AI_PROVIDER: z.enum(["fake"]).default("fake"),
  /** Secret salt of reviewer-identity hashes (ADR-013); never logged. */
  AUTHOR_HASH_SECRET: z.string().min(32),
  WORKER_CONCURRENCY: z
    .string()
    .regex(/^[1-9]\d{0,1}$/)
    .default("2"),
  /**
   * Seconds running jobs get to finish after SIGTERM before they are released
   * (keep below the host's shutdown delay: Render maxShutdownDelaySeconds 60).
   */
  WORKER_SHUTDOWN_GRACE_SECONDS: z
    .string()
    .regex(/^\d{1,3}$/)
    .default("40"),
  /** Exit for a restart when neither the loop nor a job heartbeat progressed for this long. */
  WORKER_WATCHDOG_STALL_SECONDS: z
    .string()
    .regex(/^\d{2,4}$/)
    .default("300"),
  /** Kill the process when the event loop is blocked for this long. */
  WORKER_WATCHDOG_BLOCKED_SECONDS: z
    .string()
    .regex(/^\d{2,4}$/)
    .default("60"),
  /**
   * Platform monitoring cycle (S7.3): snapshot, alert evaluation and alert
   * state sync, logged as JSON. "0" disables it (e.g. extra workers).
   */
  WORKER_MONITOR_INTERVAL_SECONDS: z
    .string()
    .regex(/^(0|\d{2,4})$/)
    .default("300"),
});

export type WebPublicEnv = z.infer<typeof WebPublicEnvSchema>;
export type WebServerEnv = z.infer<typeof WebServerEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

type RawEnv = Record<string, string | undefined>;

// A NEXT_PUBLIC_ variable is shipped to every browser. These name fragments
// indicate a credential that must stay server-side.
const SECRET_NAME_PATTERN =
  /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|_API_KEY$|DATABASE_URL|DB_URL)/;

/** Names of NEXT_PUBLIC_* variables that look like secrets. */
export function findPublicSecretNames(env: RawEnv): string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith("NEXT_PUBLIC_") && SECRET_NAME_PATTERN.test(name))
    .sort();
}

export class EnvValidationError extends Error {
  readonly variables: string[];
  constructor(message: string, variables: string[]) {
    super(`${message}: ${variables.join(", ")}`);
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

function parseEnv<T extends z.ZodType>(schema: T, env: RawEnv): z.infer<T> {
  const exposed = findPublicSecretNames(env);
  if (exposed.length > 0) {
    throw new EnvValidationError("Secrets must never use the NEXT_PUBLIC_ prefix", exposed);
  }
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((i) => String(i.path[0] ?? "(root)"))),
    ].sort();
    throw new EnvValidationError("Invalid or missing environment variables", names);
  }
  return result.data;
}

export const parseWebPublicEnv = (env: RawEnv): WebPublicEnv => parseEnv(WebPublicEnvSchema, env);
export const parseWebServerEnv = (env: RawEnv): WebServerEnv => parseEnv(WebServerEnvSchema, env);
export const parseWorkerEnv = (env: RawEnv): WorkerEnv => parseEnv(WorkerEnvSchema, env);
