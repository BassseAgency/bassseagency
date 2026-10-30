# ADR 0002 — Decisiones de la Fase 2 (flujo de compra)

Estado: aceptado (pendiente de revisión humana en el merge).
Fecha: 2026-10-30.

## 1. Lecturas entre módulos
La regla de ADR 0001 "ningún módulo lee tablas de otro" se precisa:
- **Escrituras** sobre datos de otro módulo: solo a través de puertos (`src/modules/ports.ts`).
- **Lecturas** de catálogo (`products`, `product_variants`) e `inventory` para mostrar precio y disponibilidad: se permiten por SQL directo. Si una lectura empieza a duplicar lógica, se extrae a un puerto.

## 2. Outbox propio sobre SKIP LOCKED (actualiza ADR 0001 §16.4)
ADR 0001 decía "Graphile Worker o equivalente, sin cola propia". Se implementa un **procesador de outbox** (`src/modules/notifications/outbox.ts`) sobre `for update skip locked`, con lease, backoff exponencial con jitter, dead-letter y timeout. No es una cola general de jobs: solo despacha efectos externos ya confirmados en BD. Si aparecen jobs que no son efectos de outbox (importaciones, imágenes…), se reevalúa Graphile Worker.
- Riesgo aceptado: el reloj del lease es el del proceso, no `now()` de la BD. Con varios workers, el desfase de reloj puede adelantar o retrasar un reclamo; la protección `where locked_until = <nuestro lease>` impide que un worker pise el resultado de otro.

## 3. Caducidad de sesión de Stripe < caducidad de reserva
Sin esto se podía cobrar con la reserva ya liberada (sobreventa). La sesión de Stripe caduca 5 min antes que la reserva; la TTL mínima de reserva es 35 min porque Stripe exige al menos 30 min de vida de sesión. Si aun así llega un pago sin reserva activa, se acepta y se registra `PAID_WITHOUT_RESERVATION` para conciliación.

## 4. Clave de idempotencia hacia Stripe = `checkout:<orderId>`
La clave del cliente protege `POST /checkout`. Hacia Stripe se usa una clave por pedido: si Stripe falla, el pedido se cancela y un reintento crea otro pedido con parámetros distintos; reutilizar la clave del cliente haría que Stripe rechazara la petición durante 24 h.

## 5. Dependencias: mínimo 14 días publicadas
`stripe` se fija a `23.0.0` exacta (publicada el 2026-10-01). La `23.1.0` tenía 1 día. Regla para agentes: no instalar versiones publicadas hace menos de 14 días sin justificarlo en la PR.

## Pendiente (issues abiertos)
- `orders.stripe_payment_intent_id` para ligar `charge.refunded` / `charge.dispute.created` al pedido sin depender de metadata.
- `checkout.session.async_payment_succeeded` (pagos diferidos) aún no pasa a `paid`.
- Índice del outbox que cubra `locked_until`.
- Proveedor de email real, hosting e identidad (ADRs propios).
