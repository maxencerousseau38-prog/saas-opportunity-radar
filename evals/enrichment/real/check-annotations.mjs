// Checks the annotations of the real evaluation sites against their frozen
// snapshots (ANNOTATION_GUIDE.md): structure, and every quote found in the
// text of the page it cites. Usage: node evals/enrichment/real/check-annotations.mjs [id...]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const norm = (t) =>
  String(t).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const EXCLUSION = new Set(["eligible", "excluded", "needs_review"]);
const PERIODS = new Set(["month", "year", "usage", "one_time", "custom", "unknown"]);
const FIELDS = new Set([
  "founded_year",
  "country_code",
  "city",
  "employee_min",
  "employee_max",
  "languages",
  "customer_type",
  "pricing_status",
  "launch_year",
]);

const sites = JSON.parse(readFileSync(path.join(dir, "sites.json"), "utf8")).sites.map((s) => s.id);
const wanted = process.argv.slice(2);
let failures = 0;
let checked = 0;
for (const id of wanted.length > 0 ? wanted : sites) {
  const snapFile = path.join(dir, "snapshots", `${id}.json`);
  const annFile = path.join(dir, "annotations", `${id}.json`);
  if (!existsSync(snapFile)) continue;
  const snap = JSON.parse(readFileSync(snapFile, "utf8"));
  if (snap.pages.length === 0) continue; // site not captured: not part of the set
  const problems = [];
  if (!existsSync(annFile)) {
    console.log(`${id}: MISSING annotation`);
    failures++;
    continue;
  }
  let ann;
  try {
    ann = JSON.parse(readFileSync(annFile, "utf8"));
  } catch (e) {
    console.log(`${id}: invalid JSON (${e.message})`);
    failures++;
    continue;
  }
  checked++;
  const pages = new Map(snap.pages.map((p) => [p.requested_url, norm(p.text)]));
  const checkQuote = (where, item) => {
    if (typeof item.quote !== "string" || item.quote.length < 5 || item.quote.length > 200)
      problems.push(`${where}: quote must be 5-200 characters`);
    else if (!pages.has(item.page)) problems.push(`${where}: page not in snapshot (${item.page})`);
    else if (!pages.get(item.page).includes(norm(item.quote)))
      problems.push(`${where}: quote not found in page: "${item.quote}"`);
  };
  if (ann.id !== id) problems.push("id mismatch");
  if (!["draft", "reviewed"].includes(ann.status)) problems.push("status must be draft|reviewed");
  if (ann.snapshot_retrieved_at !== snap.retrieved_at)
    problems.push("snapshot_retrieved_at mismatch");
  if (!EXCLUSION.has(ann.expected_exclusion)) problems.push("expected_exclusion invalid");
  for (const [i, p] of (ann.plans ?? []).entries()) {
    const w = `plans[${i}] ${p.name}`;
    if (!Array.isArray(p.name_any) || p.name_any.length === 0) problems.push(`${w}: name_any`);
    if (!Array.isArray(p.price_amount_any) || p.price_amount_any.length === 0)
      problems.push(`${w}: price_amount_any`);
    if (!Array.isArray(p.billing_period_any) || !p.billing_period_any.every((x) => PERIODS.has(x)))
      problems.push(`${w}: billing_period_any`);
    if (p.price_amount_any?.some((a) => a !== null) && !/^[A-Z]{3}$/.test(p.currency ?? ""))
      problems.push(`${w}: currency`);
    checkQuote(w, p);
  }
  for (const key of ["features", "integrations"]) {
    for (const [i, f] of (ann[key] ?? []).entries()) {
      const w = `${key}[${i}] ${f.label}`;
      if (!Array.isArray(f.any) || f.any.length === 0 || f.any.some((s) => s !== s.toLowerCase()))
        problems.push(`${w}: any must be lowercase substrings`);
      checkQuote(w, f);
    }
  }
  if ((ann.features ?? []).length > 8) problems.push("more than 8 features");
  if ((ann.integrations ?? []).length > 6) problems.push("more than 6 integrations");
  for (const [i, f] of (ann.fields ?? []).entries()) {
    const w = `fields[${i}] ${f.field_key}`;
    if (!FIELDS.has(f.field_key)) problems.push(`${w}: unknown field`);
    checkQuote(w, f);
  }
  const fm = ann.forbidden?.monetization_signals ?? [];
  if (!fm.includes("payment_confirmed") || !fm.includes("customer_verified"))
    problems.push(
      "forbidden.monetization_signals must include payment_confirmed and customer_verified",
    );
  if (problems.length > 0) {
    failures++;
    console.log(`${id}: ${problems.length} problem(s)`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log(
      `${id}: ok (${ann.plans.length} plans, ${ann.features.length} features, ${ann.integrations.length} integrations, ${ann.fields.length} fields, ${ann.expected_exclusion})`,
    );
  }
}
console.log(`${checked} annotation(s) checked, ${failures} with problems`);
process.exit(failures > 0 ? 1 : 0);
