# PROJECT_STATE

## Milestone actual
**Fase 2 — flujo de compra**: construida y verificada, pendiente de merge humano.

## Cadena de PRs (apiladas, merge en este orden)
`main` ← #4 (`task/3-base-fase2`) ← #6 (`task/8-integracion-fase2`) ← #10 (`task/9-indice-outbox`, issue #9) ← #11 (`task/7-payment-intent-id`, issue #7) ← #12 (`task/8-async-payment`, issue #8)

Los issues #7, #8 y #9 se cerrarán al mergear en `main` (GitHub solo cierra por `Closes` en la rama por defecto). Cada PR de la cadena toca áreas sensibles (migraciones, pagos): requieren confirmación humana.

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

## Riesgo abierto (decisión humana)
- **Pagos diferidos y reserva caducada:** un pago por transferencia que llega después de caducar la reserva entra sin stock reservado (`PAID_WITHOUT_RESERVATION`). Opciones y recomendación en ADR 0002. Recomendación: restringir Checkout a tarjeta hasta decidirlo.

## Pendiente de decisiones humanas
- Hosting de producción (afecta a preview y deploy).
- Proveedor de identidad.
- Proveedor de email transaccional.
- Claves de Stripe en modo test (nunca en el repo) para probar contra Stripe real.
- Política de métodos de pago (ver riesgo abierto).

## Próximo
- Fase 3: conciliación con Stripe, alertas, backups y runbooks.
- Fase 4: auth, admin, reembolsos, envíos e impuestos, SEO, accesibilidad.
