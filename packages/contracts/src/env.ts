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
