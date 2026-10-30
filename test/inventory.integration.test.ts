import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../src/db/tx.js';
import { AppError } from '../src/http/errors.js';
import { inventoryPort, releaseExpired } from '../src/modules/inventory/index.js';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

const FUTURE = new Date(Date.now() + 15 * 60_000);

describe.skipIf(!testDbUrl)('inventario', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await freshDb();
  });
  afterAll(async () => {
    await pool.end();
  });

  async function newOrder(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into orders (email, currency, total_cents) values ('a@b.c', 'EUR', 0) returning id`,
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('order insert failed');
    return id;
  }

  async function stock(variantId: string): Promise<{ on_hand: number; reserved: number }> {
    const { rows } = await pool.query<{ on_hand: number; reserved: number }>(
      'select on_hand, reserved from inventory where variant_id = $1',
      [variantId],
    );
    const row = rows[0];
    if (!row) throw new Error('inventory row missing');
    return row;
  }

  async function reservationStatuses(orderId: string): Promise<string[]> {
    const { rows } = await pool.query<{ status: string }>(
      'select status from stock_reservations where order_id = $1 order by variant_id',
      [orderId],
    );
    return rows.map((r) => r.status);
  }

  it('reserva todo-o-nada: si una línea falla, ninguna queda reservada', async () => {
    const a = await seedVariant(pool, { sku: 'INV-A', onHand: 5 });
    const b = await seedVariant(pool, { sku: 'INV-B', onHand: 1 });
    const orderId = await newOrder();
    const attempt = withTransaction(pool, (c) =>
      inventoryPort.reserve(
        c,
        orderId,
        [
          { variantId: a, quantity: 2 },
          { variantId: b, quantity: 2 },
        ],
        FUTURE,
      ),
    );
    await expect(attempt).rejects.toMatchObject({ category: 'CONFLICT', code: 'OUT_OF_STOCK' });
    expect(await stock(a)).toEqual({ on_hand: 5, reserved: 0 });
    expect(await stock(b)).toEqual({ on_hand: 1, reserved: 0 });
    expect(await reservationStatuses(orderId)).toEqual([]);
  });

  it('reserve es idempotente por (orderId, variantId)', async () => {
    const v = await seedVariant(pool, { sku: 'INV-IDEM', onHand: 5 });
    const orderId = await newOrder();
    const items = [{ variantId: v, quantity: 2 }];
    await withTransaction(pool, (c) => inventoryPort.reserve(c, orderId, items, FUTURE));
    await withTransaction(pool, (c) => inventoryPort.reserve(c, orderId, items, FUTURE));
    expect(await stock(v)).toEqual({ on_hand: 5, reserved: 2 });
  });

  it('commit descuenta stock una sola vez', async () => {
    const v = await seedVariant(pool, { sku: 'INV-COMMIT', onHand: 5 });
    const orderId = await newOrder();
    await withTransaction(pool, (c) => inventoryPort.reserve(c, orderId, [{ variantId: v, quantity: 2 }], FUTURE));
    await withTransaction(pool, (c) => inventoryPort.commit(c, orderId));
    await withTransaction(pool, (c) => inventoryPort.commit(c, orderId));
    expect(await stock(v)).toEqual({ on_hand: 3, reserved: 0 });
    expect(await reservationStatuses(orderId)).toEqual(['committed']);
    // Una reserva confirmada no se puede liberar.
    await withTransaction(pool, (c) => inventoryPort.release(c, orderId));
    expect(await stock(v)).toEqual({ on_hand: 3, reserved: 0 });
  });

  it('release libera una sola vez', async () => {
    const v = await seedVariant(pool, { sku: 'INV-REL', onHand: 5 });
    const orderId = await newOrder();
    await withTransaction(pool, (c) => inventoryPort.reserve(c, orderId, [{ variantId: v, quantity: 3 }], FUTURE));
    await withTransaction(pool, (c) => inventoryPort.release(c, orderId));
    await withTransaction(pool, (c) => inventoryPort.release(c, orderId));
    expect(await stock(v)).toEqual({ on_hand: 5, reserved: 0 });
    expect(await reservationStatuses(orderId)).toEqual(['released']);
    // Reservar de nuevo tras liberar no vuelve a sumar (la reserva ya existe).
    await withTransaction(pool, (c) => inventoryPort.reserve(c, orderId, [{ variantId: v, quantity: 3 }], FUTURE));
    expect(await stock(v)).toEqual({ on_hand: 5, reserved: 0 });
  });

  it('concurrencia: dos reservas simultáneas por la última unidad, solo una gana', async () => {
    const v = await seedVariant(pool, { sku: 'INV-LAST', onHand: 1 });
    const [o1, o2] = await Promise.all([newOrder(), newOrder()]);
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query('begin');
      await c2.query('begin');
      const items = [{ variantId: v, quantity: 1 }];
      // c1 reserva y mantiene la transacción abierta; c2 queda bloqueado en la misma fila.
      const r1 = inventoryPort.reserve(c1, o1, items, FUTURE);
      const r2 = inventoryPort.reserve(c2, o2, items, FUTURE);
      const settled = await Promise.allSettled([
        r1.then(() => c1.query('commit')),
        r2.then(() => c2.query('commit')),
      ]);
      const ok = settled.filter((s) => s.status === 'fulfilled');
      const failed = settled.filter((s) => s.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      const reason: unknown = failed[0]?.status === 'rejected' ? failed[0].reason : undefined;
      expect(reason).toBeInstanceOf(AppError);
      expect(reason).toMatchObject({ code: 'OUT_OF_STOCK' });
    } finally {
      await c1.query('rollback').catch(() => undefined);
      await c2.query('rollback').catch(() => undefined);
      c1.release();
      c2.release();
    }
    expect(await stock(v)).toEqual({ on_hand: 1, reserved: 1 });
  });

  it('releaseExpired libera solo reservas activas caducadas', async () => {
    const v = await seedVariant(pool, { sku: 'INV-EXP', onHand: 10 });
    // Las reservas de tests anteriores caducan en FUTURE (> now): no deben liberarse.
    const now = new Date();
    const expired = await newOrder();
    const alive = await newOrder();
    const committed = await newOrder();
    const past = new Date(now.getTime() - 60_000);
    const later = new Date(now.getTime() + 60_000);
    // La caducada se reserva la última: reservar la variante libera antes sus reservas caducadas.
    await withTransaction(pool, (c) => inventoryPort.reserve(c, alive, [{ variantId: v, quantity: 3 }], later));
    await withTransaction(pool, (c) => inventoryPort.reserve(c, committed, [{ variantId: v, quantity: 1 }], past));
    await withTransaction(pool, (c) => inventoryPort.commit(c, committed));
    await withTransaction(pool, (c) => inventoryPort.reserve(c, expired, [{ variantId: v, quantity: 2 }], past));
    expect(await stock(v)).toEqual({ on_hand: 9, reserved: 5 });

    expect(await releaseExpired(pool, now)).toBe(1);
    expect(await releaseExpired(pool, now)).toBe(0);
    expect(await stock(v)).toEqual({ on_hand: 9, reserved: 3 });
    expect(await reservationStatuses(expired)).toEqual(['released']);
    expect(await reservationStatuses(alive)).toEqual(['active']);
  });

  it('al reservar libera antes las reservas caducadas de la misma variante', async () => {
    const variantId = await seedVariant(pool, { sku: 'SKU-LAZY', onHand: 1 });
    const stale = await newOrder();
    await withTransaction(pool, (c) =>
      inventoryPort.reserve(c, stale, [{ variantId, quantity: 1 }], new Date(Date.now() - 1000)),
    );
    const fresh = await newOrder();
    await withTransaction(pool, (c) => inventoryPort.reserve(c, fresh, [{ variantId, quantity: 1 }], FUTURE));

    expect(await reservationStatuses(stale)).toEqual(['released']);
    expect(await reservationStatuses(fresh)).toEqual(['active']);
    expect(await stock(variantId)).toEqual({ on_hand: 1, reserved: 1 });
  });
});
