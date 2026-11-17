import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { freshDb, testDbUrl } from './helpers/db.js';

describe.skipIf(!testDbUrl)('solicitudes BASSSE Merch', () => {
  let db: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await freshDb();
    app = buildApp({ db, merchQuotesEnabled: true });
    await app.ready();
  });
  afterAll(async () => { await app.close(); await db.end(); });

  const valid = {
    contactName: 'Cliente Demo', contactEmail: 'compras@example.com',
    company: 'Sala Demo', productSlug: 'camisetas-oversize',
    requestedUnits: 100,
    specifications: 'Negra, oversize 220 g, logo blanco a una tinta',
  };

  it('registra solicitud pendiente sin crear pedido ni precio', async () => {
    const response = await app.inject({
      method: 'POST', url: '/merch/quote-requests', payload: valid,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; status: string }>();
    expect(body.status).toBe('pending_review');
    const { rows } = await db.query('select product_slug, requested_units from merch_quote_requests where id = $1', [body.id]);
    expect(rows).toEqual([{ product_slug: valid.productSlug, requested_units: 100 }]);
    expect((await db.query('select count(*)::int as count from orders')).rows[0]?.count).toBe(0);
  });

  it('rechaza cantidades no válidas y campos no reconocidos', async () => {
    for (const payload of [{ ...valid, requestedUnits: 0 }, { ...valid, priceCents: 1 }]) {
      const res = await app.inject({ method: 'POST', url: '/merch/quote-requests', payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it('no expone lectura de presupuestos a clientes', async () => {
    const res = await app.inject({ method: 'GET', url: '/merch/quote-requests' });
    expect(res.statusCode).toBe(404);
  });
});

describe('feature flag de solicitudes Merch', () => {
  it('desactivada sin opt-in explícito', async () => {
    const app = buildApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/merch/quote-requests', payload: {} });
      expect(res.statusCode).toBe(404);
    } finally { await app.close(); }
  });
});
