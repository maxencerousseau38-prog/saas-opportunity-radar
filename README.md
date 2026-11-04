# saas-opportunity-radar

AI-powered platform to discover, analyze and evaluate SaaS business opportunities.

## Documentation

- Product requirements (French): [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md)
- Architecture: [`docs/TECHNICAL_BLUEPRINT.md`](docs/TECHNICAL_BLUEPRINT.md)
- Implementation specifications: [`docs/IMPLEMENTATION_BLUEPRINT.md`](docs/IMPLEMENTATION_BLUEPRINT.md)
- Decisions: [`docs/ADR/`](docs/ADR/README.md)
- Development environment: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) · Testing: [`docs/TESTING.md`](docs/TESTING.md)

## Development

Requirements: Node 26.13.0 (`.nvmrc`) and pnpm 10.34.9.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e
```

Monorepo layout: `apps/web` (Next.js), `apps/worker` (persistent worker), and
`packages/*` (contracts, domain, database, data-sources, ai-gateway and the three
engines). Package boundaries are enforced by `eslint.config.mjs`.
