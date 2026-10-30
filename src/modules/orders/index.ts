import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../../db/tx.js';
import { AppError } from '../../http/errors.js';
import { hashRequest, runIdempotent } from '../../http/idempotency.js';
import { enqueueOutbox } from '../notifications/enqueue.js';
import type { AppModule } from '../index.js';
import type { CartLine, CartPort, InventoryPort } from '../ports.js';
import type { CheckoutSession, PaymentProvider, WebhookEvent } from '../payments/provider.js';
import { nextOrderStatus, type OrderStatus } from './status.js';

export { nextOrderStatus, type OrderStatus } from './status.js';

export interface OrdersModuleDeps {
  payments: PaymentProvider;
  cart: CartPort;
  inventory: InventoryPort;
  /** Duración de la reserva de stock durante el checkout. */
  reservationTtlMs: number;
  /** URL pública de la tienda, para success/cancel de Stripe. */
  appUrl: string;
}

const CHECKOUT_ROUTE = 'POST /checkout';
// Sin autenticación todavía: todas las claves comparten actor. Cambiar al añadir identidad (ADR 0002).
const ANONYMOUS_ACTOR = 'anonymous';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const checkoutBody = z.object({
  cartId: z.string().uuid(),
  email: z.string().email().max(320),
});

interface CheckoutResponse {
  orderId: string;
  checkoutUrl: string;
}

interface CreatedOrder {
  id: string;
  currency: string;
  lines: CartLine[];
}

export function createOrdersModule(deps: OrdersModuleDeps): AppModule {
  return (app, { db }) => {
    app.post('/checkout', async (req, reply) => {
      const key = readIdempotencyKey(req);
      const body = checkoutBody.parse(req.body);
      const result = await runIdempotent<CheckoutResponse>(
        db,
        { actor: ANONYMOUS_ACTOR, route: CHECKOUT_ROUTE, key, requestHash: hashRequest(body) },
        async () => ({ status: 201, body: await checkout(db, deps, req, body, key) }),
      );
      return reply.code(result.status).send(result.body);
    });

    // Contexto encapsulado: el parser de raw body solo afecta al webhook.
    void app.register((scope: FastifyInstance, _opts, done) => {
      scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, payload, next) => {
        next(null, payload);
      });
      scope.post('/webhooks/stripe', async (req, reply) => {
        const signature = req.headers['stripe-signature'];
        if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
          throw new AppError('VALIDATION', 'INVALID_SIGNATURE', 'Firma de webhook inválida');
        }
        const event = deps.payments.verifyWebhook(req.body, signature);
        const result = await handleWebhook(db, deps, req, event);
        return reply.code(200).send(result);
      });
      done();
    });
  };
}

function readIdempotencyKey(req: FastifyRequest): string {
  const raw = req.headers['idempotency-key'];
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (key.length === 0 || key.length > 255) {
    throw new AppError('VALIDATION', 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key');
  }
  return key;
}

async function checkout(
  db: Pool,
  deps: OrdersModuleDeps,
  req: FastifyRequest,
  body: z.infer<typeof checkoutBody>,
  idempotencyKey: string,
): Promise<CheckoutResponse> {
  // 1) Pedido + snapshot + reserva en una transacción.
  const order = await withTransaction(db, async (client): Promise<CreatedOrder> => {
    const lines = await deps.cart.getCartLines(client, body.cartId);
    const first = lines[0];
    if (!first) throw new AppError('VALIDATION', 'CART_EMPTY', 'El carrito está vacío');
    const currency = first.currency;
    if (lines.some((l) => l.currency !== currency)) {
      throw new AppError('VALIDATION', 'CURRENCY_MISMATCH', 'El carrito mezcla monedas');
    }
    const total = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
    const { rows } = await client.query<{ id: string }>(
      `insert into orders (status, email, currency, total_cents) values ('pending_payment', $1, $2, $3) returning id`,
      [body.email, currency, total],
    );
    const id = rows[0]?.id;
    if (!id) throw new AppError('DATABASE', 'ORDER_INSERT_FAILED', 'No se pudo crear el pedido');
    for (const l of lines) {
      await client.query(
        `insert into order_items (order_id, variant_id, sku, name, unit_price_cents, quantity)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, l.variantId, l.sku, l.name, l.unitPriceCents, l.quantity],
      );
    }
    await deps.inventory.reserve(
      client,
      id,
      lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      new Date(Date.now() + deps.reservationTtlMs),
    );
    return { id, currency, lines };
  });

  // 2) Stripe, fuera de la transacción (no se retienen locks durante la llamada externa).
  let session: CheckoutSession;
  try {
    session = await deps.payments.createCheckoutSession({
      orderId: order.id,
      email: body.email,
      currency: order.currency,
      lines: order.lines.map((l) => ({ name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
      idempotencyKey,
      successUrl: `${deps.appUrl}/checkout/success?order_id=${order.id}`,
      cancelUrl: `${deps.appUrl}/checkout/cancel?order_id=${order.id}`,
    });
  } catch (err) {
    req.log.error({ err, orderId: order.id }, 'stripe checkout session failed');
    await withTransaction(db, async (client) => {
      await client.query(
        `update orders set status = 'cancelled', version = version + 1, updated_at = now()
         where id = $1 and status = 'pending_payment'`,
        [order.id],
      );
      await deps.inventory.release(client, order.id);
    }).catch((cancelErr: unknown) => {
      req.log.error({ err: cancelErr, orderId: order.id }, 'failed to cancel order after stripe failure');
    });
    throw new AppError('INTEGRATION', 'PAYMENT_PROVIDER_UNAVAILABLE', 'No se pudo iniciar el pago');
  }

  await db.query(`update orders set stripe_checkout_session_id = $2, updated_at = now() where id = $1`, [
    order.id,
    session.id,
  ]);
  return { orderId: order.id, checkoutUrl: session.url };
}

interface LockedOrder {
  id: string;
  status: OrderStatus;
  email: string;
  currency: string;
  total_cents: number;
}

async function handleWebhook(
  db: Pool,
  deps: OrdersModuleDeps,
  req: FastifyRequest,
  event: WebhookEvent,
): Promise<{ received: true; duplicate?: true }> {
  return withTransaction(db, async (client) => {
    // Dedupe en la misma transacción que el efecto: si algo falla, rollback y Stripe reintenta.
    const ins = await client.query(
      `insert into processed_events (provider, event_id) values ('stripe', $1) on conflict do nothing`,
      [event.id],
    );
    if (ins.rowCount !== 1) return { received: true, duplicate: true };

    if (!event.orderId || !UUID_RE.test(event.orderId)) return { received: true };
    const { rows } = await client.query<LockedOrder>(
      `select id, status, email, currency, total_cents from orders where id = $1 for update`,
      [event.orderId],
    );
    const order = rows[0];
    if (!order) {
      req.log.warn({ eventId: event.id, orderId: event.orderId }, 'webhook for unknown order');
      return { received: true };
    }

    const next = nextOrderStatus(order.status, event);
    if (next === order.status) return { received: true };

    if (next === 'paid' && !amountMatches(order, event)) {
      // No se marca pagado un importe que no cuadra; queda para conciliación manual.
      req.log.error(
        { eventId: event.id, orderId: order.id, expected: order.total_cents, got: event.amountTotalCents },
        'paid amount mismatch',
      );
      return { received: true };
    }

    await client.query(
      `update orders
       set status = $2, version = version + 1, updated_at = now(),
           paid_at = case when $2 = 'paid' then now() else paid_at end
       where id = $1`,
      [order.id, next],
    );

    if (next === 'paid') {
      await deps.inventory.commit(client, order.id);
      await enqueueOutbox(client, {
        topic: 'email.order_confirmation',
        dedupeKey: `order:${order.id}:confirmation`,
        payload: { orderId: order.id, email: order.email },
      });
    } else if (next === 'cancelled') {
      await deps.inventory.release(client, order.id);
    }
    return { received: true };
  });
}

function amountMatches(order: LockedOrder, event: WebhookEvent): boolean {
  return event.amountTotalCents === order.total_cents && event.currency === order.currency;
}
