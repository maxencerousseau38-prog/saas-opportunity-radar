# PD-27 — Worker host: analysis and recommendation

- **Status:** ACCEPTED — approved by the product owner on 6 November 2026 (Render Background Worker, Frankfurt)
- **Decision owner:** product owner
- **Related:** ADR-001 (PD-02 A, PD-03 A), ADR-004 (PGMQ), PD-24 (residency B),
  Implementation Blueprint §11, §15 "Sprint 7"
- **Nothing was deployed and no account was created; no spending.**

## 1. What the worker actually needs (verified in the code)

| Need | Finding | Consequence for the host |
|---|---|---|
| Process model | One persistent Node.js process (`apps/worker/src/main.ts`, `Worker.run`) polling every 2 s; jobs up to 3,600 s (analyses), 1,800 s (discovery, pain runs) | Needs an always-on process, no request timeout, no scale-to-zero |
| Queue access (PGMQ) | The worker never opens a PostgreSQL connection: every queue operation is a service-role RPC over HTTPS through `supabase-js` (`sor_worker_read`, `sor_worker_claim`, heartbeats…) | **PGMQ compatibility is identical on every host**: outbound HTTPS to the Supabase API is enough; no connection pooler, no IPv6 or static-IP requirement |
| Inbound traffic | None; the Technical Blueprint forbids public HTTP endpoints on the worker | A "background worker" type is ideal; a web-service type would need a dummy port |
| Outbound traffic | Supabase API, AI providers (later), official websites through the SSRF-safe fetcher | Ordinary public egress; no static egress IP needed |
| Resilience | Leases, heartbeats, retries, orphan recovery and crash recovery are already tested (CI worker-integration) | Short restarts and deploys are safe; one instance is enough |
| Shutdown | SIGTERM/SIGINT stop the loop cooperatively | Host must send SIGTERM with a grace period |
| Health | No health endpoint yet | Sprint 7 adds a liveness signal (internal watchdog that exits when the loop stalls, or a private health port); the host must restart a crashed process |
| Region | Supabase staging + production in an EU region (PD-02 A); customer reviews need EU processing (PD-24 residency B) | Worker must run in the EU, close to the Supabase region |
| Size | Personal tool, low volume; Node with modest memory | 0.5–1 vCPU, 512 MB–1 GB, one instance per environment |
| Secrets | `SUPABASE_SECRET_KEY`, `AUTHOR_HASH_SECRET`, later AI keys | Encrypted environment variables / secret store |

Rejected by architecture (unchanged): Vercel functions and Supabase Edge
Functions (duration limits; `CLAUDE.md` §11).

## 2. Candidates

Prices are for **one always-on instance per environment** (staging and
production need two). Only Google's pricing page could be read directly;
the other official pages were blocked by the cloud network policy on
6 November 2026, so their figures come from third-party summaries and are
marked **(to verify)**.

| Host | EU regions | Worker fit | Monthly cost (1 instance) | Reliability | Simplicity | Notes |
|---|---|---|---|---|---|---|
| **Render** — Background Worker | Frankfurt | Native "background worker" type, restart on crash, no port needed | ~7 USD Starter (512 MB, 0.5 CPU) **(to verify)** | Managed PaaS; no health checks for workers (restart on crash only) | ★★★★★ GitHub auto-deploy, dashboard, env vars | Flat price, no usage surprises; Frankfurt only in the EU |
| **Google Cloud Run** — worker pools (GA April 2026) | Paris (`europe-west9`, Tier 1), Belgium, Frankfurt (Tier 2)… | Built for pull-based workers, no inbound traffic | **11.61 USD** for 1 vCPU / 512 MiB in Belgium with the free tier, 16.83 USD without (official example); Paris is Tier 1 like Belgium | ★★★★★ Google infrastructure, integrated logging and monitoring | ★★★ GCP project, IAM, Artifact Registry, CI service account | Verified pricing; strongest operations tooling; cross-cloud to Supabase (AWS) |
| **Fly.io** — Machines | Paris, Frankfurt, Amsterdam… | Process with restart policy and internal health checks | ~3–4 USD (512 MB shared CPU) **(to verify)** | ★★★ Good, history of platform incidents | ★★★★ CLI + `fly.toml` | Cheapest managed option, Paris available |
| **Railway** | Amsterdam (EU West) | Service without public domain | 5 USD Hobby incl. 5 USD usage, then usage **(to verify)** | ★★★ Hobby plan may pause services at limits | ★★★★★ | Usage-based billing; one EU region |
| **DigitalOcean** App Platform (worker) | Frankfurt, Amsterdam | Worker component | ~5–10 USD **(to verify)** | ★★★★ | ★★★★ | |
| **Scaleway** (Paris) | Paris, Amsterdam, Warsaw | Instances (VM) or Serverless Containers (scale-to-zero, not a fit) | Small VM a few EUR **(to verify)**; price update June 2026 | ★★★★ | ★★ VM to operate yourself | EU sovereign provider |
| **Clever Cloud** (Paris) | Paris | Node app; workers attached to an app | ~5–6 EUR smallest **(to verify)** | ★★★★ | ★★★ expects an HTTP port | French PaaS |
| **Hetzner** Cloud VPS | Germany, Finland | Any process (systemd/Docker) | ~4–5 EUR after the 2026 increases **(to verify)** | ★★ depends on our own operations | ★★ OS, Docker, updates, monitoring on us | Cheapest, most work |
| **AWS ECS Fargate** | Paris, Frankfurt (same cloud as Supabase) | Long-running task | ~10–15 USD incl. public IPv4 **(to verify)** | ★★★★★ | ★ VPC, IAM, task definitions | Lowest latency to Supabase, highest complexity |

## 3. Recommendation

**Render Background Worker (Starter) in Frankfurt, with the Supabase
projects in Frankfurt (`eu-central-1`) and the Vercel functions in
Frankfurt (`fra1`).**

Why:

1. **Exact fit**: a background-worker service type (no port, no request
   timeout, restart on crash) matches our process model without a
   workaround.
2. **Simplicity**: deploys from the GitHub repository (monorepo build or
   Dockerfile), environment variables in a dashboard, logs included — the
   least operations work for a one-person product.
3. **Predictable cost**: a flat instance price (~7 USD per environment,
   ~14 USD for staging + production; to verify), no usage surprises; the
   staging worker can be suspended when unused.
4. **Region coherence**: Frankfurt for Supabase, Vercel and the worker keeps
   all three in one EU metro, satisfies PD-24 residency B, and keeps RPC
   latency low (it matters little anyway: AI calls and site fetches
   dominate job time).
5. **PGMQ**: nothing to adapt — the worker uses HTTPS RPCs only.

Accepted limits and mitigations:

- No health checks for workers → Sprint 7 adds an internal watchdog (the
  process exits if the polling loop or heartbeats stall, Render restarts
  it) and a database-side alert on stale jobs.
- One EU region only (Frankfurt) → fine as long as Supabase is created in
  Frankfurt. If the product owner prefers **Paris** for Supabase, choose
  **Cloud Run worker pools in `europe-west9`** instead (verified ~12 USD,
  strongest reliability, more setup).

**Runner-up:** Cloud Run worker pools (Paris) when reliability tooling and
verified pricing outweigh setup simplicity. **Budget option:** Fly.io
(Paris) at a few dollars, with more CLI work and a weaker incident history.

## 4. What approval would trigger (Sprint 7, not started)

1. Confirm the price and plan on Render's official page (blocked from this
   environment).
2. Create the Supabase staging/production projects in Frankfurt (PD-02 A)
   — a separate product-owner action, paid.
3. Add a worker Dockerfile (Node 26.13.0, pnpm deploy of `@sor/worker`),
   the watchdog, and a deploy workflow; staging first.
4. Secrets set by the product owner in the host dashboard; never in the
   repository or the chat.

## Sources

- Google Cloud Run pricing (official, read 6 Nov 2026): https://cloud.google.com/run/pricing
- Supabase regions (official, via search): https://supabase.com/docs/guides/platform/regions
- Render worker pricing (third party): https://deployhandbook.com/pricing/render
- Fly.io pricing (official page via search, not fetched): https://fly.io/docs/about/pricing/
- Railway pricing (third party): https://pricingsaas.com/companies/railway
- Hetzner 2026 price increases (third party): https://www.tomshardware.com/tech-industry/hetzner-to-raise-prices-by-up-to-37-percent-from-april-1
- Scaleway pricing update: https://www.scaleway.com/en/blog/a-transparent-update-on-scaleway-pricing/
- DigitalOcean App Platform pricing: https://docs.digitalocean.com/products/app-platform/details/pricing/
