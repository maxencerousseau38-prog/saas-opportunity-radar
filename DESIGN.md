# UI Design System — SaaS Opportunity Radar

**Direction:** monochrome, shadcn-inspired, dark-first.  
**Reference:** [shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template).

This file is the visual source of truth for UI work. It describes the direction to use when Claude integrates shadcnstore blocks into this repository.

## Design principles

- Black and white are the brand palette. Use neutral grays for hierarchy, borders and surfaces.
- Keep the interface quiet, dense enough for research workflows, and easy to scan.
- Use clear page titles, short supporting descriptions, compact metadata and consistent spacing.
- Prefer thin borders and subtle surface changes over gradients, glow effects or large shadows.
- Use semantic colors only when communicating a real state (success, warning or destructive action).
- Preserve keyboard focus, readable contrast and responsive behavior.

## Color tokens

The application exposes these Tailwind v4 tokens through apps/web/app/globals.css:

| Token | Purpose |
| --- | --- |
| bg-bg | Main page background |
| bg-surface | Sidebar, cards and raised surfaces |
| bg-surface-2 | Inputs, selected items and secondary surfaces |
| border-border | Subtle neutral separators |
| text-fg | Main text |
| text-muted | Secondary text |
| bg-accent text-accent-fg | High-contrast primary action / brand mark |
| text-success, text-warning, text-danger | Semantic status only |

The palette follows the neutral dark scale used by the reference template: near-black canvas, charcoal surfaces, soft-white foreground and low-contrast borders. Do not add a blue, purple or gradient brand accent.

## Application shell

- Desktop: fixed left sidebar (16rem), compact top bar, wide content canvas.
- Mobile: compact top bar, horizontal scrollable primary navigation, full-width content.
- Sidebar: product identity, workspace switcher, primary research navigation and signed-in identity.
- Active navigation: neutral raised surface, border and clear text/icon contrast.
- Content: use a consistent max-width, responsive page padding and vertical rhythm.

## Blocks and Claude workflow

When using shadcnstore blocks:

1. Treat blocks as composition references and starting points, not as a replacement for the product architecture.
2. Adapt the markup and styling to the tokens above. Use bg-surface, bg-surface-2, text-fg, text-muted, border-border and the existing semantic status tokens.
3. Keep the existing Next.js App Router, Tailwind CSS v4, Radix-based primitives, class-variance-authority, cn() helper and lucide-react icons.
4. The reference template's current 2.x implementation uses Base UI. Do not migrate this app to Base UI just to paste a block; adapt the block to the primitives already installed here.
5. Preserve server/client boundaries, Supabase authorization, workspace isolation, service functions, validation and existing product behavior.
6. Do not replace real product data or server actions with demo arrays, placeholder handlers or static UI.
7. Integrate one block at a time, then verify responsive behavior, accessibility, lint, typecheck and tests.

## Component conventions

- Buttons: compact, medium weight, neutral primary/secondary/outline/ghost hierarchy.
- Cards: subtle surface, 1px border, restrained radius; avoid decorative gradients.
- Inputs: neutral raised background, visible border and obvious focus ring.
- Tables: clear column hierarchy, compact rows, muted metadata and low-contrast dividers.
- Badges: neutral by default; semantic colors only for meaningful states.
- Icons: Lucide, usually 16px in navigation and controls.
- Avoid arbitrary new colors and one-off styling when a token or shared component exists.
