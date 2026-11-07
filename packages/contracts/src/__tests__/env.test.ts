import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  findPublicSecretNames,
  parseWebPublicEnv,
  parseWebServerEnv,
  parseWorkerEnv,
} from "../env";

const KEY = "sb_publishable_0123456789abcdef";
const SECRET = "sb_secret_0123456789abcdefghij";

describe("findPublicSecretNames", () => {
  it("flags secrets exposed with the NEXT_PUBLIC_ prefix", () => {
    expect(
      findPublicSecretNames({
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: "x",
        NEXT_PUBLIC_SERVICE_ROLE: "x",
        NEXT_PUBLIC_OPENAI_API_KEY: "x",
        NEXT_PUBLIC_DATABASE_URL: "x",
      }),
    ).toEqual([
      "NEXT_PUBLIC_DATABASE_URL",
      "NEXT_PUBLIC_OPENAI_API_KEY",
      "NEXT_PUBLIC_SERVICE_ROLE",
      "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    ]);
  });

  it("does not flag the publishable key or server-only secrets", () => {
    expect(
      findPublicSecretNames({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SECRET_KEY: SECRET,
      }),
    ).toEqual([]);
  });
});

describe("environment parsing", () => {
  it("parses a valid web server environment and defaults APP_ENV to local", () => {
    const env = parseWebServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
      SUPABASE_SECRET_KEY: SECRET,
    });
    expect(env.APP_ENV).toBe("local");
  });

  it("requires SITE_URL in staging and production only (invitation links, S7.4d)", () => {
    const base = {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
      SUPABASE_SECRET_KEY: SECRET,
    };
    expect(() => parseWebServerEnv({ ...base, APP_ENV: "production" })).toThrow(/SITE_URL/);
    expect(
      parseWebServerEnv({ ...base, APP_ENV: "staging", SITE_URL: "https://staging.example.com" })
        .SITE_URL,
    ).toBe("https://staging.example.com");
    expect(() =>
      parseWebServerEnv({ ...base, APP_ENV: "production", SITE_URL: "javascript:alert(1)" }),
    ).toThrow(/SITE_URL/);
    expect(parseWebServerEnv({ ...base, APP_ENV: "test" }).SITE_URL).toBeUndefined();
  });

  it("refuses to start when a secret is exposed to the browser", () => {
    expect(() =>
      parseWebPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: SECRET,
      }),
    ).toThrow(EnvValidationError);
  });

  it("names missing variables without ever printing values", () => {
    let error: unknown;
    try {
      parseWorkerEnv({
        SUPABASE_URL: "javascript:alert(1)",
        SUPABASE_SECRET_KEY: "short-but-secret",
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const message = (error as Error).message;
    expect(message).toContain("SUPABASE_URL");
    expect(message).toContain("SUPABASE_SECRET_KEY");
    expect(message).not.toContain("short-but-secret");
    expect(message).not.toContain("javascript:");
  });
});
