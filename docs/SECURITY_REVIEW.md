# Security and RLS review (Sprint 7, S7.4)

**Review date:** 7 November 2026 (read-only audit, then fixes in slices
S7.4a–S7.4e, each validated by CI). Scope: workspaces and roles, database
(RLS, grants, functions), worker, `/api/v1`, operator console,
authentication configuration, CI supply chain. Nothing is deployed; hosted
settings are listed as a checklist for the product owner (§5).

References: Technical Blueprint §11 (security architecture), §14, §19;
Implementation Blueprint §12 (permission matrix); PRD §16; `CLAUDE.md` §7.

## 1. Method

- **Database**: every migration applied to a disposable PostgreSQL 16
  database, then the catalog queried (RLS flags, table, column and function
  privileges of `anon` / `authenticated`, policies, `search_path`, schema
  usage, views, sequences). The result is frozen in
  `supabase/tests/019_privilege_manifest.sql` (exact manifest + structural
  rules) so that any drift fails CI.
- **API**: every `route.ts` export inspected (wrapper, minimum role); every
  service-role use in `apps/web` traced to a prior membership check and a
  `workspace_id` filter.
- **Worker, operator, auth**: code review of logs, secrets handling, the
  operator guard and SQL re-checks, `supabase/config.toml`, the auth
  callback route, the session proxy.
- **Supply chain**: `pnpm audit --prod` (no known vulnerability on
  7 Nov 2026); git history searched for credential patterns (test
  placeholders only).

## 2. What holds

| Area | Result |
|---|---|
| Tables | RLS on all 64 tables of `public`; `anon` holds no privilege; no `FOR ALL` policy; every policy `TO authenticated`; every browser grant backed by a policy for that command |
| Attribution columns | `created_by`, `added_by`, `assigned_by`, `updated_by`, `reported_by` forced to `auth.uid()` by `WITH CHECK`; `owner` can never be assigned, changed or removed through policies |
| Functions | every function of `public` / `private` pins `search_path`; 51 `SECURITY DEFINER` functions are service-role only; only `create_workspace` and `workspace_member_directory` are definer functions callable from the browser; definer RPCs re-check actor, role, lease owner or operator |
| API | all 70 exports go through `route()` / `workspaceRoute()` with the matrix's minimum role; workspace ID from the path; non-members get 404 |
| Service role in the web app | always after a membership check through the user client (RLS), with a `workspace_id` filter; module marked `server-only`; never imported by client components |
| CSRF | same-origin check on mutations and JSON-only bodies |
| Redirects | `auth/confirm` follows no user-supplied target |
| Operator | API guard (404) and SQL re-check against `platform_operators`; decisions audit-logged |
| Worker | logs carry error codes only; non-root image; SSRF-safe fetcher |
| Dependencies | `pnpm audit --prod`: no known vulnerability |

No critical or high finding.

## 3. Findings and status

| # | Level | Finding | Fix | Status |
|---|---|---|---|---|
| M1 | Medium | No HTTP security headers (CSP, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`) | Static headers (next.config) and per-request CSP with nonce (proxy): Report-Only in S7.4b with no violation over the E2E suite (CI run 66), enforced in S7.4c; reports to `/api/csp-report` | **Fixed (S7.4b–c)** |
| M2 | Medium | No systematic test of every privilege of the browser roles: a new table could be exposed silently | pgTAP 019 privilege manifest + structural rules | **Fixed (S7.4a)** |
| M3 | Medium | No rate limit on member invitations (emails), manual catalog additions, correction reports | `sor_consume_rate_limit` (fixed windows, `rate_limit_counters`): 20 invitations per workspace, 20 manual additions and 30 correction reports per user, per hour; 429 `RATE_LIMITED` + `Retry-After` | **Fixed (S7.4d)** |
| M4 | Medium | Weak local auth policy (6-character passwords, no `secure_password_change`), no MFA, including for the operator | Passwords ≥ 12 with letters and digits and secure password change (local config, password form; hosted checklist §5) — S7.4d; operator console and API require an MFA-verified session (AAL2, TOTP; PD-30) — S7.4e | **Fixed (S7.4d–e)** |
| M5 | Medium | No secret scanning, dependency audit or update automation in CI | gitleaks (full history), `pnpm audit --prod --audit-level high`, Dependabot | **Fixed (S7.4a)** |
| L1 | Low | 13 `private` functions executable by `PUBLIC` (so `anon`), unreachable without schema usage | Revoked; previous access kept for `authenticated` and `service_role` | **Fixed (S7.4a)** |
| L2 | Low | Migration timestamps ahead of the calendar: a later migration stamped with the real time would sort before applied ones | Names kept; CI enforces strictly increasing, forward-only migrations | **Fixed (S7.4a)** |
| L3 | Low | Invitation link built from the request origin | `SITE_URL` (required in staging and production) builds invitation links | **Fixed (S7.4d)** |
| L4 | Low | An admin can tell whether an email already has an account (`invitation_sent`) | Accepted: admins are trusted, signup is closed; documented | Accepted |
| L5 | Low | Cursor HMAC key derived from `SUPABASE_SECRET_KEY`: rotating the key invalidates open cursors | Accepted (cursors are short-lived); documented | Accepted |

## 4. Rules that CI now enforces (S7.4a)

- `supabase/tests/019_privilege_manifest.sql`: RLS everywhere, no view in
  `public`, no `FOR ALL`, policies `TO authenticated`, pinned
  `search_path`, nothing for `anon`, exact table / column / function
  privileges of `authenticated`. A new grant must be added to the manifest
  on purpose, in the same change.
- `scripts/check-migrations.mjs`: names `<14 digits>_<snake_case>.sql`,
  unique timestamps, new migrations sort after every applied one, applied
  migrations are never modified, renamed or deleted. Naming rule: the next
  migration takes the later of the current UTC time and the last timestamp
  plus one day.
- Secret scan (gitleaks, `.gitleaks.toml`): whole git history on every
  push; allowlist limited to test placeholders and third-party public
  content kept for evaluations.
- `pnpm audit --prod --audit-level high`; Dependabot weekly (npm, GitHub
  Actions, worker base image), pull requests only.

## 4b. Web hardening (S7.4b–c)

- Static headers on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, HSTS (effective on HTTPS).
- Content Security Policy, enforced, per request (`proxy.ts`,
  `lib/security-headers.ts`): scripts only with the request nonce
  (+ `'strict-dynamic'`), `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri` / `form-action` / `connect-src 'self'`, images from `https:`
  (external product logos), inline styles allowed (React style
  attributes), `upgrade-insecure-requests` over HTTPS. Violations are
  reported to `/api/csp-report` (public, bounded, redacted log line,
  rate-limited).
- E2E: every journey fails on a CSP violation; `security.e2e.ts` checks
  the headers, the nonce on every script, a fresh nonce per response and
  that an injected inline event handler (XSS payload) is blocked.
- `apps/web/test/api-routes.test.ts`: every API export wrapped, operator
  routes call `requireOperator`, method → minimum role manifest
  (`test/api-route-manifest.json`, 95 exports).

## 4c. Operator MFA (S7.4e, PD-30)

- The operator console (`/operator`) and every operator API route require a
  session verified with a TOTP factor (`aal2`). The assurance level is read
  from verified JWT claims (`getClaims`), never from an unverified cookie.
  Non-operators still get 404; an operator at `aal1` gets the MFA screen
  (console) or 403 with `mfa_required` (API).
- First visit: enrolment (QR code or key, then a code); later sessions: a
  6-digit code. Abandoned unverified factors are removed before a new
  enrolment. TOTP is enabled in `supabase/config.toml` and must be enabled
  on the hosted projects (§5).
- Lost authenticator: the product owner removes the factor in the Supabase
  dashboard (Authentication → Users → the operator → MFA factors), then
  enrols again at the next visit (`docs/DEPLOYMENT.md`).
- E2E: the operator journey checks the 403 before MFA, enrols with a TOTP
  computed in the test (RFC 6238), then uses the console and its API.

## 4d. Workspace isolation sweep (S7.5b, scenario F12)

- `apps/web/e2e/workspace-isolation.e2e.ts` (E2E job, runs after every other
  journey so the demo workspace holds runs, clusters, opportunities,
  analyses, exports, jobs, collections, saved searches and tags): the owner
  of another workspace calls **every** export under
  `/api/v1/workspaces/{workspaceId}/` listed in
  `apps/web/test/api-route-manifest.json`.
- (a) With the demo workspace's ID and real resource IDs: 404 on every
  route and method, no demo identifier in any response body.
- (b) With their own workspace ID and the demo workspace's resource IDs
  (classic IDOR): every read is 404; no write succeeds (404, or 400 when the
  body is rejected first; never 2xx or 5xx). Catalog routes (`/products/…`)
  are global by design and are covered by (a) only.
- The demo workspace's rows (collections, items, saved searches, tags,
  members, clusters, opportunities, runs, analyses, exports, job
  cancellations, name) are compared before and after the sweep: unchanged.
- A new workspace route is swept automatically once it is in the manifest
  (which `apps/web/test/api-routes.test.ts` already requires).

## 5. Hosted configuration checklist (product owner, when the Frankfurt projects are created)

Not applied: no hosted project exists yet.

- [ ] Authentication: public signup disabled; anonymous sign-ins disabled.
- [ ] Passwords: minimum 12 characters, letters and digits; secure password
      change on; leaked-password protection if the plan offers it.
- [ ] MFA: TOTP enabled; the operator account enrolled (PD-30).
- [ ] Redirect URLs: only the production / staging web origins; `SITE_URL`
      set to the same origin in Vercel (required at startup in staging and
      production).
- [ ] Email: custom SMTP sender, auth email rate limits reviewed.
- [ ] Secrets: `SUPABASE_SECRET_KEY` and `AUTHOR_HASH_SECRET` only in the
      Render and Vercel dashboards, different per environment.
- [ ] GitHub: secret scanning and push protection enabled in the
      repository settings when available for the account.
