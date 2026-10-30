import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { withTransaction } from '../src/db/tx.js';
import { cartPort } from '../src/modules/cart/index.js';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

interface CartBody {
  id: string;
  lines: { variantId: string; quantity: number; unitPriceCents: number }[];
  subtotalCents: number;
}

describe.skipIf(!testDbUrl)('carrito', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let v1: string;
  let v2: string;

  beforeAll(async () => {
    pool = await freshDb();
    app = buildApp({ db: pool });
    v1 = await seedVariant(pool, { sku: 'CART-1', priceCents: 1000 });
    v2 = await seedVariant(pool, { sku: 'CART-2', priceCents: 250 });
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function newCart(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/carts' });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  function putItem(cartId: string, variantId: string, quantity: number) {
    return app.inject({ method: 'PUT', url: `/carts/${cartId}/items`, payload: { variantId, quantity } });
  }

  it('crea un carrito vacío', async () => {
    const id = await newCart();
    const res = await app.inject({ method: 'GET', url: `/carts/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<CartBody>()).toEqual({ id, lines: [], subtotalCents: 0 });
  });

  it('upsert de líneas y subtotal en céntimos', async () => {
    const id = await newCart();
    expect((await putItem(id, v1, 1)).statusCode).toBe(200);
    expect((await putItem(id, v2, 2)).statusCode).toBe(200);
    // Repetir sobre la misma variante fija la cantidad, no duplica la línea.
    const res = await putItem(id, v1, 3);
    const body = res.json<CartBody>();
    expect(body.lines.map((l) => [l.variantId, l.quantity])).toEqual([
      [v1, 3],
      [v2, 2],
    ]);
    expect(body.subtotalCents).toBe(3 * 1000 + 2 * 250);
  });

  it('quantity 0 elimina la línea', async () => {
    const id = await newCart();
    await putItem(id, v1, 2);
    await putItem(id, v2, 1);
    const body = (await putItem(id, v1, 0)).json<CartBody>();
    expect(body.lines.map((l) => l.variantId)).toEqual([v2]);
    expect(body.subtotalCents).toBe(250);
  });

  it('variante inexistente → 404 VARIANT_NOT_FOUND', async () => {
    const id = await newCart();
    const res = await putItem(id, '00000000-0000-4000-8000-000000000000', 1);
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VARIANT_NOT_FOUND');
  });

  it('carrito inexistente → 404 CART_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/carts/00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CART_NOT_FOUND');
  });

  it('valida el body y los params con zod', async () => {
    const id = await newCart();
    expect((await putItem(id, v1, -1)).statusCode).toBe(400);
    expect((await putItem(id, 'no-uuid', 1)).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/carts/no-uuid' })).statusCode).toBe(400);
  });

  it('CartPort.getCartLines devuelve las líneas con precio vigente', async () => {
    const id = await newCart();
    await putItem(id, v2, 4);
    const lines = await withTransaction(pool, (c) => cartPort.getCartLines(c, id));
    expect(lines).toEqual([
      { variantId: v2, sku: 'CART-2', name: 'CART-2', unitPriceCents: 250, currency: 'EUR', quantity: 4 },
    ]);
  });
});
