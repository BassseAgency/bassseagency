import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { freshDb, testDbUrl } from './helpers/db.js';

const SECRET = 'test-cron-secret';

describe.skipIf(!testDbUrl)('cron de mantenimiento /internal/worker-tick', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = await freshDb();
    app = buildApp({ db: pool, cronSecret: SECRET });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('rechaza sin secreto o con secreto incorrecto', async () => {
    expect((await app.inject({ method: 'GET', url: '/internal/worker-tick' })).statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'GET',
      url: '/internal/worker-tick',
      headers: { authorization: 'Bearer test-cron-secreX' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('con el secreto ejecuta una pasada de mantenimiento', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/worker-tick',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ released: 0, cancelled: 0, outbox: { claimed: 0, sent: 0, failed: 0, dead: 0 } });
  });

  it('sin CRON_SECRET el endpoint no existe', async () => {
    const plain = buildApp({ db: pool });
    await plain.ready();
    expect((await plain.inject({ method: 'GET', url: '/internal/worker-tick' })).statusCode).toBe(404);
    await plain.close();
  });
});
