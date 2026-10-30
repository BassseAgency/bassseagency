# PROJECT_STATE

## Milestone actual
**Fase 1 — esqueleto ejecutable** (en curso, rama `task/1-esqueleto`).

## Hecho
- Fase 0: repo privado→público, `main` protegida (PR obligatoria, sin force push, sin borrado), ADR 0001, AGENTS.md, plantillas.
- Fase 1:
  - TypeScript + Fastify, `/health/live` y `/health/ready` (503 normalizado si la base falla).
  - Runner de migraciones forward-only con advisory lock y registro en `schema_migrations`.
  - Migración `0001_baseline` (vacía a propósito).
  - Tests: unit de health + integración de migraciones contra Postgres real.
  - Workflow CI: lint, typecheck, test (con Postgres service), build; gitleaks. Actions fijadas por SHA.

## Pendiente de decisiones humanas
- Hosting de producción (ADR 0002). Afecta a preview y deploy.
- Proveedor de identidad (ADR 0003).
- Cuenta Stripe en modo test: se necesitan claves de test del usuario. Nunca se guardan en el repo.

## Próximo
- Fase 2: catálogo → carrito/stock → pedido idempotente → webhook Stripe → outbox → E2E.
