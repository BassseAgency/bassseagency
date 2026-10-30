import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

describe.skipIf(!testDbUrl)('esquema 0002: invariantes en base de datos', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await freshDb();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('impide reservar más stock del que hay', async () => {
    const variantId = await seedVariant(pool, { sku: 'SKU-STOCK', onHand: 2 });
    await expect(
      pool.query('update inventory set reserved = 3 where variant_id = $1', [variantId]),
    ).rejects.toThrow(/check/i);
  });

  it('impide stock negativo', async () => {
    const variantId = await seedVariant(pool, { sku: 'SKU-NEG', onHand: 1 });
    await expect(
      pool.query('update inventory set on_hand = -1 where variant_id = $1', [variantId]),
    ).rejects.toThrow(/check/i);
  });

  it('SKU único', async () => {
    await seedVariant(pool, { sku: 'SKU-DUP' });
    await expect(seedVariant(pool, { sku: 'SKU-DUP' })).rejects.toThrow(/duplicate|unique/i);
  });

  it('webhook duplicado choca con processed_events', async () => {
    await pool.query(`insert into processed_events (provider, event_id) values ('stripe', 'evt_1')`);
    await expect(
      pool.query(`insert into processed_events (provider, event_id) values ('stripe', 'evt_1')`),
    ).rejects.toThrow(/duplicate|unique/i);
  });

  it('outbox deduplica por dedupe_key', async () => {
    const q = `insert into outbox (topic, dedupe_key, payload) values ('email', 'order-1:confirm', '{}')`;
    await pool.query(q);
    await expect(pool.query(q)).rejects.toThrow(/duplicate|unique/i);
  });

  it('estado de pedido restringido a valores válidos', async () => {
    await expect(
      pool.query(`insert into orders (email, currency, total_cents, status) values ('a@b.c', 'EUR', 0, 'shipped_maybe')`),
    ).rejects.toThrow(/check/i);
  });
});
