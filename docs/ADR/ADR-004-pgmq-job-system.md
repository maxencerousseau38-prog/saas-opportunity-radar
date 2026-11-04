# ADR-004 — PGMQ-based durable job system

- **Status:** ACCEPTED, subject to a verification gate in Sprint 3
- **Date:** 4 November 2026
- **Sources:** `CLAUDE.md` §5 (Supabase Queues / PGMQ "after verifying the actual enabled extension and supported API"), §11; Implementation Blueprint v1.0 §3 (Migration 0007), §10.

## Decision

- One durable queue, `sor_jobs`. The underscore is used **[ASSUMPTION]** to avoid depending on hyphen support in queue names.
- `job_executions` is the source of truth. Messages carry only `{schema_version, kind, job_execution_id}`.
- Job creation is atomic: one SECURITY DEFINER function inserts the domain row and the job row, then sends the message, in a single transaction.
- Idempotency is scoped to (workspace, requester, kind, key) and checked with a request hash. A different payload under the same key returns `409`.
- Leases equal one heartbeat cycle. Heartbeats extend the lease and the message visibility.
- Retries use exponential backoff with jitter. Retry exhaustion leads to a dead letter.
- Cancellation is cooperative. Terminal reasons are always recorded.
- Recovery:
  - stale leases are reclaimed by the claim RPC;
  - an orphan sweeper re-sends missing messages.
- Web and worker use the server Supabase client and service-role-only RPCs. Queue functions are never exposed to `anon` or `authenticated`.

## Verification gate

Before any queue code, Sprint 3 must confirm:

- that PGMQ is available in the target Supabase version;
- the queue-name rules;
- the signatures of `pgmq.create`, `send`, `read`, `set_vt`, `archive` and `delete`.

The official documentation was unreachable during consolidation. If PGMQ is unavailable or differs materially, work stops, and the smallest reliable alternative (for example, a `job_executions`-based polling queue using `FOR UPDATE SKIP LOCKED`) is proposed as a new `PENDING_USER_APPROVAL` decision.

## Alternatives considered

- An external queue service. Rejected: an extra dependency and no transactional enqueue.

## Verification gate result (Sprint 3, 4 November 2026)

**Passed.** On the Supabase CLI 3.0.0 local stack (PostgreSQL 17), CI step
"PGMQ verification gate" reports `pgmq` 1.5.1 available (also `pg_cron`
1.6.4 and `vector` 0.8.2). Signatures used by migration
`20261105120000_jobs_queue.sql`:

- `pgmq.create(queue_name text) → void`;
- `pgmq.send(queue_name text, msg jsonb, delay integer) → setof bigint`;
- `pgmq.read(queue_name text, vt integer, qty integer, conditional jsonb) → setof pgmq.message_record`;
- `pgmq.set_vt(queue_name text, msg_id bigint, vt integer) → setof pgmq.message_record`;
- `pgmq.archive(queue_name text, msg_id bigint) → boolean`;
- `pgmq.delete(queue_name text, msg_id bigint) → boolean`.

The queue name `sor_jobs` (underscore) is accepted; its table is
`pgmq.q_sor_jobs` (pgTAP-checked). The extension is created by the migration
(CLI workflow); schema `pgmq` is revoked from `public`, `anon` and
`authenticated`, and `pgmq_public` is not created. Hosted staging and
production projects must enable Supabase Queues in the same way (to verify at
the first deployment, Sprint 7).

