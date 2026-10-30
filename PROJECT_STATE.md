# PROJECT_STATE

## Milestone actual
**Fase 2 — flujo de compra**: en `main` (PRs #4, #13, #10, #11 y #12, mergeadas el 2026-10-30).
Pendiente de merge humano: reserva ampliada para pagos diferidos (issue #14).

## Hecho
- **Fase 0:** repo público, `main` protegida (PR obligatoria, sin force push, sin borrado), ADR 0001, AGENTS.md, plantillas.
- **Fase 1** (PR #1, en `main`): TypeScript + Fastify, `/health/live` y `/health/ready`, migraciones forward-only con advisory lock, CI (lint, typecheck, test con Postgres, build, gitleaks) con Actions fijadas por SHA.
- **Fase 2:**
  - Esquema 0002: catálogo, variantes, inventario, carrito, pedidos, reservas, idempotencia, `processed_events`, outbox, audit_logs.
  - Catálogo (`GET /products`, `GET /products/:slug`), carrito (`POST /carts`, `PUT /carts/:id/items`, `GET /carts/:id`).
  - Inventario: reserva todo-o-nada con orden estable de bloqueo, commit/release idempotentes, barrido de caducadas en el worker.
  - Pedidos: `POST /checkout` con `Idempotency-Key`, Stripe Checkout (`stripe@23.0.0`), webhook firmado con deduplicación y transiciones monotónicas.
  - Pagos diferidos: `async_payment_succeeded` confirma el pago (issue #8).
  - Reembolsos y disputas se ligan al pedido por `payment_intent` aunque el evento no traiga metadata (migración 0004, issue #7).
  - Outbox + worker: lease, backoff con jitter, dead-letter, timeout; email de confirmación (sender de log, sin proveedor real).
  - Índice parcial del outbox para el reclamo (migración 0003, issue #9).
  - Tests: unit, integración contra Postgres 16 y end-to-end del flujo de compra (119 en la punta de la cadena).
  - Decisiones en ADR 0002.

## Pagos diferidos (issue #14, ADR 0002 §6)
- Tarjeta, Bizum y transferencia. La transferencia reserva stock 5 días; si no llega, el worker cancela el pedido. Un pago tardío se registra como `PAID_AFTER_CANCELLATION` para reembolso.

## Pendiente de decisiones humanas
- Hosting de producción (afecta a preview y deploy).
- Proveedor de identidad.
- Proveedor de email transaccional.
- Claves de Stripe en modo test (nunca en el repo) para probar contra Stripe real.
- Activar transferencia y Bizum en el panel de Stripe (comprobar que Bizum está disponible para la cuenta).

## Próximo
- Fase 3: conciliación con Stripe, alertas, backups y runbooks.
- Fase 4: auth, admin, reembolsos, envíos e impuestos, SEO, accesibilidad.
