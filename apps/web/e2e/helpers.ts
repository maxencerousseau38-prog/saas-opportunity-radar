import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "";
export const OWNER = "demo-owner@demo.test";
export const MEMBER = "demo-member@demo.test";
export const VIEWER = "demo-viewer@demo.test";

export async function signIn(page: Page, email: string): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]+\/discover/);
  const match = /\/w\/([0-9a-f-]+)\//.exec(page.url());
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

export async function waitForResults(page: Page) {
  await expect(page.getByTestId("result-count")).not.toHaveText("…");
  await expect(page.getByRole("status").filter({ hasText: "Chargement" })).toHaveCount(0);
}

// ---------------------------------------------------------------- operator MFA (PD-30)

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret, as authenticator apps compute it. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, "0");
}

// The operator enrols once per database; later sessions reuse the secret.
const SECRET_FILE = "test-results/.operator-totp-secret";

/** Opens /operator as the signed-in operator and completes MFA (enrolment or challenge). */
export async function operatorMfa(page: Page): Promise<void> {
  await page.goto("/operator");
  const enrol = page.getByRole("button", { name: "Configurer l’application d’authentification" });
  const code = page.getByLabel(/Code (de l’application|affiché par l’application)/);
  await expect(enrol.or(code)).toBeVisible();
  let secret: string;
  if (await enrol.isVisible()) {
    await enrol.click();
    secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
    mkdirSync("test-results", { recursive: true });
    writeFileSync(SECRET_FILE, secret);
  } else {
    secret = readFileSync(SECRET_FILE, "utf8").trim();
  }
  await page.getByLabel(/Code (de l’application|affiché par l’application)/).fill(totp(secret));
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByRole("heading", { name: "Console opérateur" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Santé de la plateforme" })).toBeVisible();
}
