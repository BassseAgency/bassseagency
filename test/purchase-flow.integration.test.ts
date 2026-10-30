import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { releaseExpired } from '../src/modules/inventory/index.js';
import { type EmailMessage, type EmailSender, orderConfirmationHandler, ORDER_CONFIRMATION_TOPIC } from '../src/modules/notifications/email.js';
import { processOutboxBatch } from '../src/modules/notifications/outbox.js';
import { FakePaymentProvider } from '../src/modules/payments/fake.js';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

const WHSEC = 'whsec_test_purchase_flow';

class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    return Promise.resolve();
  }
}

/**
 * Flujo de compra completo con los módulos reales (solo Stripe es falso):
 * catálogo → carrito → checkout → webhook firmado → pedido pagado → stock → email vía outbox.
 */
describe.skipIf(!testDbUrl)('flujo de compra end-to-end', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let payments: FakePaymentProvider;
  let variantId: string;

  beforeAll(async () => {
    pool = await freshDb();
    variantId = await seedVariant(pool, { sku: 'TEE-BLK-M', priceCents: 2500, onHand: 3 });
    payments = new FakePaymentProvider(WHSEC);
    app = buildApp({ db: pool, payments, appUrl: 'http://localhost:3000' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  /** Evento de Stripe firmado con el secreto de tests. */
  function signedEvent(type: string, object: Record<string, unknown>) {
    const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: 'event', type, data: { object } });
    return app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC }),
      },
    });
  }

  async function stock() {
    const { rows } = await pool.query<{ on_hand: number; reserved: number }>(
      'select on_hand, reserved from inventory where variant_id = $1',
      [variantId],
    );
    return rows[0];
  }

  function webhook(type: string, orderId: string, amountCents: number) {
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: 'event',
      type,
      data: {
        object: {
          object: 'checkout.session',
          id: `cs_test_${orderId}`,
          client_reference_id: orderId,
          metadata: { order_id: orderId },
          payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
          amount_total: amountCents,
          currency: 'eur',
        },
      },
    });
    return app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC }),
      },
    });
  }

  async function addToNewCart(quantity: number): Promise<string> {
    const created = await app.inject({ method: 'POST', url: '/carts' });
    expect(created.statusCode).toBe(201);
    const cartId = (created.json() as { id: string }).id;
    const put = await app.inject({ method: 'PUT', url: `/carts/${cartId}/items`, payload: { variantId, quantity } });
    expect(put.statusCode).toBe(200);
    return cartId;
  }

  it('compra completa: pago confirmado, stock descontado y un único email', async () => {
    const list = await app.inject({ method: 'GET', url: '/products' });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).toContain('TEE-BLK-M');

    const cartId = await addToNewCart(2);
    const checkout = await app.inject({
      method: 'POST',
      url: '/checkout',
      payload: { cartId, email: 'cliente@example.com' },
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(checkout.statusCode).toBe(201);
    const { orderId } = checkout.json() as { orderId: string };
    expect(await stock()).toEqual({ on_hand: 3, reserved: 2 });

    // Stripe entrega el evento dos veces: solo un efecto.
    expect((await webhook('checkout.session.completed', orderId, 5000)).statusCode).toBe(200);
    expect((await webhook('checkout.session.completed', orderId, 5000)).statusCode).toBe(200);

    const { rows } = await pool.query<{ status: string }>('select status from orders where id = $1', [orderId]);
    expect(rows[0]?.status).toBe('paid');
    expect(await stock()).toEqual({ on_hand: 1, reserved: 0 });

    const sender = new CapturingEmailSender();
    const handlers = { [ORDER_CONFIRMATION_TOPIC]: orderConfirmationHandler(sender) };
    const opts = { batchSize: 10, lockMs: 30_000, maxAttempts: 3, handlerTimeoutMs: 5_000 };
    await processOutboxBatch(pool, handlers, opts);
    await processOutboxBatch(pool, handlers, opts);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe('cliente@example.com');
  });

  it('sin stock suficiente el checkout falla con 409 y no deja reservas', async () => {
    const cartId = await addToNewCart(5);
    const res = await app.inject({
      method: 'POST',
      url: '/checkout',
      payload: { cartId, email: 'otro@example.com' },
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('OUT_OF_STOCK');
    expect(await stock()).toEqual({ on_hand: 1, reserved: 0 });
  });

  it('checkout caducado libera la reserva y cancela el pedido', async () => {
    const cartId = await addToNewCart(1);
    const res = await app.inject({
      method: 'POST',
      url: '/checkout',
      payload: { cartId, email: 'tarde@example.com' },
      headers: { 'idempotency-key': randomUUID() },
    });
    const { orderId } = res.json() as { orderId: string };
    expect(await stock()).toEqual({ on_hand: 1, reserved: 1 });

    expect((await webhook('checkout.session.expired', orderId, 2500)).statusCode).toBe(200);
    const { rows } = await pool.query<{ status: string }>('select status from orders where id = $1', [orderId]);
    expect(rows[0]?.status).toBe('cancelled');
    expect(await stock()).toEqual({ on_hand: 1, reserved: 0 });

    // El barrido del worker no libera dos veces.
    expect(await releaseExpired(pool, new Date(Date.now() + 365 * 86_400_000))).toBe(0);
    expect(await stock()).toEqual({ on_hand: 1, reserved: 0 });
  });

  it('reembolso sin metadata se liga al pedido por payment_intent', async () => {
    const cartId = await addToNewCart(1);
    const checkout = await app.inject({
      method: 'POST',
      url: '/checkout',
      payload: { cartId, email: 'reembolso@example.com' },
      headers: { 'idempotency-key': randomUUID() },
    });
    const { orderId } = checkout.json() as { orderId: string };
    const paymentIntent = `pi_${randomUUID()}`;

    const paid = await signedEvent('checkout.session.completed', {
      object: 'checkout.session',
      id: `cs_${orderId}`,
      client_reference_id: orderId,
      metadata: { order_id: orderId },
      payment_status: 'paid',
      amount_total: 2500,
      currency: 'eur',
      payment_intent: paymentIntent,
    });
    expect(paid.statusCode).toBe(200);

    // El cargo llega sin metadata: solo el payment_intent identifica el pedido.
    const refund = await signedEvent('charge.refunded', {
      object: 'charge',
      id: `ch_${randomUUID()}`,
      payment_intent: paymentIntent,
      metadata: {},
    });
    expect(refund.statusCode).toBe(200);

    const { rows } = await pool.query<{ status: string; stripe_payment_intent_id: string }>(
      'select status, stripe_payment_intent_id from orders where id = $1',
      [orderId],
    );
    expect(rows[0]).toEqual({ status: 'refunded', stripe_payment_intent_id: paymentIntent });
  });

  it('pago diferido: pendiente hasta async_payment_succeeded y entonces descuenta stock', async () => {
    // Restock explícito: los tests anteriores agotan la variante.
    await pool.query('update inventory set on_hand = on_hand + 2 where variant_id = $1', [variantId]);
    expect(await stock()).toEqual({ on_hand: 2, reserved: 0 });

    const cartId = await addToNewCart(1);
    const checkout = await app.inject({
      method: 'POST',
      url: '/checkout',
      payload: { cartId, email: 'diferido@example.com' },
      headers: { 'idempotency-key': randomUUID() },
    });
    const { orderId } = checkout.json() as { orderId: string };
    const session = {
      object: 'checkout.session',
      id: `cs_${orderId}`,
      client_reference_id: orderId,
      metadata: { order_id: orderId },
      amount_total: 2500,
      currency: 'eur',
      payment_intent: `pi_${randomUUID()}`,
    };
    const statusOf = async () =>
      (await pool.query<{ status: string }>('select status from orders where id = $1', [orderId])).rows[0]?.status;

    // Completed sin pago: el cliente aún no ha pagado. Stock reservado, pedido pendiente.
    expect((await signedEvent('checkout.session.completed', { ...session, payment_status: 'unpaid' })).statusCode).toBe(200);
    expect(await statusOf()).toBe('pending_payment');
    expect(await stock()).toEqual({ on_hand: 2, reserved: 1 });

    // El dinero llega días después: el pedido se paga y el stock se descuenta.
    expect((await signedEvent('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })).statusCode).toBe(200);
    expect(await statusOf()).toBe('paid');
    expect(await stock()).toEqual({ on_hand: 1, reserved: 0 });
  });
});
