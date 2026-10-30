import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { freshDb, seedVariant, testDbUrl } from './helpers/db.js';

describe.skipIf(!testDbUrl)('catálogo', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let variantId: string;

  beforeAll(async () => {
    pool = await freshDb();
    app = buildApp({ db: pool });
    variantId = await seedVariant(pool, { sku: 'CAT-1', priceCents: 1500, onHand: 5 });
    await pool.query('update inventory set reserved = 2 where variant_id = $1', [variantId]);
    await pool.query(`insert into products (slug, name, status) values ('borrador', 'Borrador', 'draft')`);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lista solo productos activos con variantes y disponible', async () => {
    const res = await app.inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(200);
    const { products } = res.json<{ products: { slug: string; variants: unknown[] }[] }>();
    expect(products.map((p) => p.slug)).toEqual(['p-cat-1']);
    expect(products[0]?.variants).toEqual([
      { id: variantId, sku: 'CAT-1', name: 'CAT-1', priceCents: 1500, currency: 'EUR', available: 3 },
    ]);
  });

  it('devuelve un producto por slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/p-cat-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ slug: string }>().slug).toBe('p-cat-1');
  });

  it('404 PRODUCT_NOT_FOUND si no existe o no está activo', async () => {
    for (const slug of ['no-existe', 'borrador']) {
      const res = await app.inject({ method: 'GET', url: `/products/${slug}` });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('PRODUCT_NOT_FOUND');
    }
  });
});
