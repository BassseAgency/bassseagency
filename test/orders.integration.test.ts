import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError, registerErrorHandler } from '../src/http/errors.js';
import { hashRequest } from '../src/http/idempotency.js';
import { createOrdersModule, MIN_RESERVATION_TTL_MS } from '../src/modules/orders/index.js';
import { FakePaymentProvider } from '../src/modules/payments/fake.js';
import type { CartLine, CartPort, InventoryPort, ReservationItem } from '../src/modules/ports.js';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

// Secreto inventado solo para firmar en tests. Ninguna llamada de red a Stripe.
const WHSEC = 'whsec_test_orders_fake_secret';

class FakeCart implements CartPort {
  readonly carts = new Map<string, CartLine[]>();
  getCartLines(_client: PoolClient, cartId: string): Promise<CartLine[]> {
    const lines = this.carts.get(cartId);
    if (!lines) return Promise.reject(new AppError('NOT_FOUND', 'CART_NOT_FOUND', 'Carrito no encontrado'));
    return Promise.resolve(lines);
  }
}

type InventoryCall =
  | { op: 'reserve'; orderId: string; items: ReservationItem[]; expiresAt: Date }
  | { op: 'commit' | 'release'; orderId: string }
  | { op: 'extend'; orderId: string; expiresAt: Date };

class FakeInventory implements InventoryPort {
  readonly calls: InventoryCall[] = [];
  reserve(_c: PoolClient, orderId: string, items: ReservationItem[], expiresAt: Date): Promise<void> {
    this.calls.push({ op: 'reserve', orderId, items, expiresAt });
    return Promise.resolve();
  }
  /** Líneas que devuelve commit; 0 simula pago con la reserva ya liberada. */
  committedLines = 1;
  commit(_c: PoolClient, orderId: string): Promise<number> {
    this.calls.push({ op: 'commit', orderId });
    return Promise.resolve(this.committedLines);
  }
  release(_c: PoolClient, orderId: string): Promise<void> {
    this.calls.push({ op: 'release', orderId });
    return Promise.resolve();
  }
  extend(_c: PoolClient, orderId: string, expiresAt: Date): Promise<number> {
    this.calls.push({ op: 'extend', orderId, expiresAt });
    return Promise.resolve(1);
  }
  ops(orderId: string): string[] {
    return this.calls.filter((c) => c.orderId === orderId).map((c) => c.op);
  }
}

describe.skipIf(!testDbUrl)('pedidos: checkout y webhook de Stripe', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let variantId: string;
  let cart: FakeCart;
  let inventory: FakeInventory;
  let payments: FakePaymentProvider;

  beforeAll(async () => {
    pool = await freshDb();
    variantId = await seedVariant(pool, { sku: 'SKU-ORD', priceCents: 1500, onHand: 10 });
  });

  beforeEach(async () => {
    cart = new FakeCart();
    inventory = new FakeInventory();
    payments = new FakePaymentProvider(WHSEC);
    await app?.close();
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    createOrdersModule({ payments, cart, inventory, reservationTtlMs: MIN_RESERVATION_TTL_MS, appUrl: 'http://localhost:3000' })(
      app,
      { db: pool },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  function newCart(quantity = 2): string {
    const id = randomUUID();
    cart.carts.set(id, [
      { variantId, sku: 'SKU-ORD', name: 'Camiseta', unitPriceCents: 1500, currency: 'EUR', quantity },
    ]);
    return id;
  }

  function postCheckout(body: Record<string, unknown>, key?: string) {
    return app.inject({
      method: 'POST',
      url: '/checkout',
      payload: body,
      headers: key ? { 'idempotency-key': key } : {},
    });
  }

  async function checkoutOk(): Promise<string> {
    const res = await postCheckout({ cartId: newCart(), email: 'a@example.com' }, randomUUID());
    expect(res.statusCode).toBe(201);
    return (res.json() as { orderId: string }).orderId;
  }

  function sessionEvent(type: string, orderId: string, extra: Record<string, unknown> = {}) {
    return {
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
          amount_total: 3000,
          currency: 'eur',
          ...extra,
        },
      },
    };
  }

  function sendWebhook(event: unknown, secret = WHSEC) {
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    });
  }

  async function orderRow(id: string) {
    const { rows } = await pool.query<{
      status: string;
      version: number;
      paid_at: Date | null;
      total_cents: number;
      stripe_checkout_session_id: string | null;
    }>('select status, version, paid_at, total_cents, stripe_checkout_session_id from orders where id = $1', [id]);
    return rows[0];
  }

  async function outboxCount(orderId: string): Promise<number> {
    const { rows } = await pool.query<{ n: string }>('select count(*) as n from outbox where dedupe_key = $1', [
      `order:${orderId}:confirmation`,
    ]);
    return Number(rows[0]?.n);
  }

  describe('POST /checkout', () => {
    it('rechaza una TTL de reserva menor que la vida mínima de la sesión de Stripe', () => {
      expect(() =>
        createOrdersModule({ payments, cart, inventory, reservationTtlMs: 15 * 60_000, appUrl: 'http://x' }),
      ).toThrow(/reservationTtlMs/);
    });

    it('la sesión de Stripe caduca antes que la reserva y usa una clave por pedido', async () => {
      const clientKey = randomUUID();
      const res = await postCheckout({ cartId: newCart(), email: 'a@example.com' }, clientKey);
      const { orderId } = res.json() as { orderId: string };
      const call = payments.calls.at(-1);
      const reserve = inventory.calls.find((c) => c.op === 'reserve' && c.orderId === orderId);
      expect(call?.idempotencyKey).toBe(`checkout:${orderId}`);
      expect(call?.idempotencyKey).not.toContain(clientKey);
      if (reserve?.op !== 'reserve' || !call) throw new Error('faltan llamadas');
      expect(call.expiresAt.getTime()).toBeLessThan(reserve.expiresAt.getTime());
      // Stripe exige al menos 30 min de vida de sesión.
      expect(call.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 29 * 60_000);
    });

    it('falta Idempotency-Key → 400 y no crea pedido', async () => {
      const before = await pool.query('select count(*) from orders');
      const res = await postCheckout({ cartId: newCart(), email: 'a@example.com' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const after = await pool.query('select count(*) from orders');
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(payments.calls).toHaveLength(0);
    });

    it('crea pedido pending_payment con snapshot, reserva y sesión de Stripe', async () => {
      const key = randomUUID();
      const res = await postCheckout({ cartId: newCart(2), email: 'a@example.com' }, key);
      expect(res.statusCode).toBe(201);
      const { orderId, checkoutUrl } = res.json() as { orderId: string; checkoutUrl: string };
      expect(checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);

      const order = await orderRow(orderId);
      expect(order).toMatchObject({ status: 'pending_payment', total_cents: 3000 });
      expect(order?.stripe_checkout_session_id).toBeTruthy();

      const { rows: items } = await pool.query('select sku, name, unit_price_cents, quantity from order_items where order_id = $1', [orderId]);
      expect(items).toEqual([{ sku: 'SKU-ORD', name: 'Camiseta', unit_price_cents: 1500, quantity: 2 }]);

      const reserve = inventory.calls.find((c) => c.op === 'reserve');
      expect(reserve).toMatchObject({ orderId, items: [{ variantId, quantity: 2 }] });
      if (reserve?.op === 'reserve') expect(reserve.expiresAt.getTime()).toBeGreaterThan(Date.now() + 34 * 60_000);

      expect(payments.calls).toHaveLength(1);
      expect(payments.calls[0]).toMatchObject({
        orderId,
        idempotencyKey: `checkout:${orderId}`,
        currency: 'EUR',
        email: 'a@example.com',
      });
    });

    it('misma clave dos veces → un solo pedido y la misma respuesta', async () => {
      const key = randomUUID();
      const body = { cartId: newCart(), email: 'a@example.com' };
      const first = await postCheckout(body, key);
      // Mismo contenido con claves en otro orden: mismo hash canónico.
      const second = await postCheckout({ email: body.email, cartId: body.cartId }, key);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(payments.calls).toHaveLength(1);
      const { rows } = await pool.query('select count(*)::int as n from orders where id = $1', [first.json().orderId]);
      expect(rows[0]).toEqual({ n: 1 });
      expect(inventory.calls.filter((c) => c.op === 'reserve')).toHaveLength(1);
    });

    it('misma clave con body distinto → 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const key = randomUUID();
      const cartId = newCart();
      expect((await postCheckout({ cartId, email: 'a@example.com' }, key)).statusCode).toBe(201);
      const res = await postCheckout({ cartId, email: 'otro@example.com' }, key);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(payments.calls).toHaveLength(1);
    });

    it('clave en curso → 409 IDEMPOTENCY_IN_PROGRESS', async () => {
      const key = randomUUID();
      const body = { cartId: newCart(), email: 'a@example.com' };
      await pool.query(
        `insert into idempotency_requests (actor, route, key, request_hash, status) values ('anonymous', 'POST /checkout', $1, $2, 'in_progress')`,
        [key, hashRequest(body)],
      );
      const res = await postCheckout(body, key);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });

    it('carrito vacío → 400 CART_EMPTY sin pedido ni sesión', async () => {
      const cartId = randomUUID();
      cart.carts.set(cartId, []);
      const res = await postCheckout({ cartId, email: 'a@example.com' }, randomUUID());
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('CART_EMPTY');
      expect(payments.calls).toHaveLength(0);
      expect(inventory.calls).toHaveLength(0);
    });

    it('body inválido → 400', async () => {
      const res = await postCheckout({ cartId: 'no-uuid', email: 'x' }, randomUUID());
      expect(res.statusCode).toBe(400);
    });

    it('fallo de Stripe → 502, pedido cancelled, release llamado y la clave se puede reintentar', async () => {
      payments.failWith = new Error('stripe down');
      const key = randomUUID();
      const body = { cartId: newCart(), email: 'a@example.com' };
      const res = await postCheckout(body, key);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect(JSON.stringify(res.json())).not.toContain('stripe down');

      const orderId = payments.calls[0]?.orderId ?? '';
      expect((await orderRow(orderId))?.status).toBe('cancelled');
      expect(inventory.ops(orderId)).toEqual(['reserve', 'release']);

      // La fila in_progress se borró: un reintento con la misma clave vuelve a ejecutar.
      payments.failWith = null;
      const retry = await postCheckout(body, key);
      expect(retry.statusCode).toBe(201);
      expect(retry.json().orderId).not.toBe(orderId);
    });
  });

  describe('POST /webhooks/stripe', () => {
    it('firma inválida → 400 sin efectos', async () => {
      const orderId = await checkoutOk();
      const event = sessionEvent('checkout.session.completed', orderId);
      const res = await sendWebhook(event, 'whsec_test_otro_secreto');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_SIGNATURE');
      expect((await orderRow(orderId))?.status).toBe('pending_payment');
      const { rows } = await pool.query('select 1 from processed_events where event_id = $1', [event.id]);
      expect(rows).toHaveLength(0);
      expect(await outboxCount(orderId)).toBe(0);
    });

    it('sin cabecera de firma → 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: '{}',
        headers: { 'content-type': 'application/json' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('completed pagado → paid, version+1, commit de stock y un mensaje en outbox', async () => {
      const orderId = await checkoutOk();
      const before = await orderRow(orderId);
      const res = await sendWebhook(sessionEvent('checkout.session.completed', orderId));
      expect(res.statusCode).toBe(200);
      const after = await orderRow(orderId);
      expect(after?.status).toBe('paid');
      expect(after?.paid_at).toBeInstanceOf(Date);
      expect(after?.version).toBe((before?.version ?? 0) + 1);
      expect(inventory.ops(orderId)).toEqual(['reserve', 'commit']);
      const { rows } = await pool.query<{ topic: string; payload: unknown }>(
        'select topic, payload from outbox where dedupe_key = $1',
        [`order:${orderId}:confirmation`],
      );
      expect(rows).toEqual([{ topic: 'email.order_confirmation', payload: { orderId, email: 'a@example.com' } }]);
    });

    it('webhook duplicado → un solo efecto y un solo mensaje en outbox', async () => {
      const orderId = await checkoutOk();
      const event = sessionEvent('checkout.session.completed', orderId);
      const first = await sendWebhook(event);
      const second = await sendWebhook(event);
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ duplicate: true });
      expect(inventory.ops(orderId)).toEqual(['reserve', 'commit']);
      expect(await outboxCount(orderId)).toBe(1);
      expect((await orderRow(orderId))?.version).toBe(1);
    });

    it('expired después de completed no retrocede paid ni libera stock', async () => {
      const orderId = await checkoutOk();
      await sendWebhook(sessionEvent('checkout.session.completed', orderId));
      const res = await sendWebhook(sessionEvent('checkout.session.expired', orderId));
      expect(res.statusCode).toBe(200);
      expect((await orderRow(orderId))?.status).toBe('paid');
      expect(inventory.ops(orderId)).toEqual(['reserve', 'commit']);
    });

    it('expired sobre pending_payment → cancelled y release', async () => {
      const orderId = await checkoutOk();
      const res = await sendWebhook(sessionEvent('checkout.session.expired', orderId));
      expect(res.statusCode).toBe(200);
      expect((await orderRow(orderId))?.status).toBe('cancelled');
      expect(inventory.ops(orderId)).toEqual(['reserve', 'release']);
      expect(await outboxCount(orderId)).toBe(0);
    });

    it('completed con importe que no cuadra no marca pagado', async () => {
      const orderId = await checkoutOk();
      const res = await sendWebhook(sessionEvent('checkout.session.completed', orderId, { amount_total: 1 }));
      expect(res.statusCode).toBe(200);
      expect((await orderRow(orderId))?.status).toBe('pending_payment');
      expect(await outboxCount(orderId)).toBe(0);
    });

    it('charge.refunded sobre paid → refunded', async () => {
      const orderId = await checkoutOk();
      await sendWebhook(sessionEvent('checkout.session.completed', orderId));
      const res = await sendWebhook({
        id: `evt_${randomUUID()}`,
        object: 'event',
        type: 'charge.refunded',
        data: { object: { object: 'charge', id: 'ch_test_1', metadata: { order_id: orderId } } },
      });
      expect(res.statusCode).toBe(200);
      expect((await orderRow(orderId))?.status).toBe('refunded');
    });

    it('evento de tipo desconocido → 200 sin efecto pero registrado', async () => {
      const event = { id: `evt_${randomUUID()}`, object: 'event', type: 'customer.created', data: { object: { object: 'customer', id: 'cus_1' } } };
      const res = await sendWebhook(event);
      expect(res.statusCode).toBe(200);
      const { rows } = await pool.query(`select 1 from processed_events where provider = 'stripe' and event_id = $1`, [event.id]);
      expect(rows).toHaveLength(1);
      expect(inventory.calls).toHaveLength(0);
    });

    it('el parser de raw body no afecta a otras rutas JSON', async () => {
      const res = await postCheckout({ cartId: newCart(), email: 'a@example.com' }, randomUUID());
      expect(res.statusCode).toBe(201);
    });
  });
});
