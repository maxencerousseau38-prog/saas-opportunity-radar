# ADR-014 — Workspace opportunity status model

- **Status:** ACCEPTED (PD-04, option A, approved on 4 November 2026)
- **Date:** 4 November 2026
- **Sources:**
  - PRD §10.3: each opportunity has a modifiable status (seven values); generated opportunities have their own statuses.
  - PRD §12.10: the collection link table lists `personal_notes` and `status`.
  - Implementation Blueprint v1.0: a status on both `collection_items` and `workspace_product_states`, which can diverge.

## Options

| Option | Model | Consequence |
|---|---|---|
| A (recommended) | One status per product per workspace (`workspace_product_states.status`). `collection_items` keeps per-collection notes. Collections display the workspace status. | One source of truth. Moving a product to "Rejected" is visible everywhere. |
| B | A status per collection item **and** a workspace status | Matches PRD §12.10 literally. The same product can be "Validated" in one collection and "Rejected" in another. |

## Common to both options

- Generated opportunities have their own `status` column (PRD §10.3).
- The PRD field `status` in §12.10 is satisfied:
  - under option A, through the workspace state shown in each collection;
  - under option B, literally.

## Decision

Option A: one status per product per workspace in `workspace_product_states`; collection items keep notes only and display the workspace status.
