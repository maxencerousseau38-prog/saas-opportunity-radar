# ADR-015 — Manual external AI research handoff

- **Status:** ACCEPTED (PD-35)
- **Date:** 8 November 2026
- **Source:** Product-owner instruction in the attached “Master Product Completion V1” brief.

## Context

The internal provider-neutral AI gateway remains subject to PD-24 provider,
model, budget, and evaluation decisions. The product-owner brief also asks
for a way to use external assistants without an application API key. That
workflow must not be represented as an execution of the internal engines or
as a resolution of PD-24.

## Decision

1. Ask AI is a separate, manual handoff. The application builds a bounded
   prompt from catalog data; the user previews and copies it, opens the
   selected assistant, and pastes the prompt there. The application does not
   invoke an external API, access an assistant session, or automate a user
   account.
2. The initial destinations are the official web interfaces of Claude,
   ChatGPT, Gemini, and Perplexity. The choice only controls the displayed
   label, prompt wording, and link; it does not select a model or imply that
   a user's account or plan supports a particular capability.
3. The initial subject scope is one to five catalog products. General
   product facts and their evidence references are included; features,
   pricing, feedback summaries, and catalogued competitor relationships
   are optional. The UI shows a preview before the user creates the saved
   handoff. Unavailable evidence references are identified as unavailable.
4. An imported answer is a user-supplied external research note with
   provenance to its saved destination, strategy, subject, prompt, and
   workspace. It is unverified and does not create evidence, modify the
   catalog, change a score, or feed an internal engine.
5. Sessions are workspace-scoped. Members may read workspace sessions;
   creation and import require workspace membership; only the creator or a
   workspace owner/admin may update or delete a session. Browser roles have
   no direct write grant; server writes use the service role only after
   route-level authorization.

## Consequences

- No API key, paid provider call, or automatic external transfer is needed
  for this workflow.
- The user is responsible for choosing whether to copy catalog context to
  an external assistant. The application exposes the prompt and optional
  sections for review before saving or copying.
- Product-set comparison is limited to the selected catalog snapshots and
  bounded feedback samples. It does not compute cross-competitor pain
  clusters.
- Custom strategy creation and context from clusters or generated
  opportunities are outside this initial slice and require a later
  implementation and validation pass.
- PD-24 remains pending for the internal AI gateway and engines.

## Security and validation

The implementation uses workspace authorization before service-role writes,
RLS for workspace reads, input schemas with size limits, prompt instructions
that treat catalog text as untrusted data, and explicit unverified labels on
imported responses. The migration and automated tests are present in source
but have not been applied or run; runtime validation remains outstanding.

## Alternatives considered

- **Wait for PD-24 and add the feature to the internal gateway:** rejected
  for this slice because it would require provider credentials and paid
  evaluation before users could try a manual workflow.
- **Automate browser sessions or use consumer account credentials:**
  rejected because this application has no supported authorization or
  session integration for those assistants.
