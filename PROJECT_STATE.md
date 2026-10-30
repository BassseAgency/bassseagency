# PROJECT_STATE

## Milestone actual
**Fase 2 — flujo de compra** (en revisión: PR de base #4 y PR de integración).

## Hecho
- **Fase 0:** repo público, `main` protegida (PR obligatoria, sin force push, sin borrado), ADR 0001, AGENTS.md, plantillas.
- **Fase 1** (PR #1, en `main`): TypeScript + Fastify, `/health/live` y `/health/ready`, migraciones forward-only con advisory lock, CI (lint, typecheck, test con Postgres, build, gitleaks) con Actions fijadas por SHA.
- **Fase 2** (pendiente de merge):
  - Esquema 0002: catálogo, variantes, inventario, carrito, pedidos, reservas, idempotencia, `processed_events`, outbox, audit_logs.
  - Catálogo (`GET /products`, `GET /products/:slug`), carrito (`POST /carts`, `PUT /carts/:id/items`, `GET /carts/:id`).
  - Inventario: reserva todo-o-nada con orden estable de bloqueo, commit/release idempotentes, barrido de caducadas en el worker.
  - Pedidos: `POST /checkout` con `Idempotency-Key`, Stripe Checkout (`stripe@23.0.0`), webhook firmado con deduplicación y transiciones monotónicas.
  - Outbox + worker: lease, backoff con jitter, dead-letter, timeout; email de confirmación (sender de log, sin proveedor real).
  - 110 tests: unit, integración contra Postgres 16 y end-to-end del flujo de compra.
  - Decisiones en ADR 0002.

## Pendiente de decisiones humanas
- Hosting de producción (afecta a preview y deploy).
- Proveedor de identidad.
- Proveedor de email transaccional.
- Claves de Stripe en modo test (nunca en el repo) para probar contra Stripe real.

## Próximo
- Issues de ADR 0002 "Pendiente": payment_intent_id, pagos diferidos, índice del outbox.
- Fase 3: conciliación con Stripe, alertas, backups y runbooks.
