import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health endpoints', () => {
  it('liveness responde ok sin tocar la base de datos', async () => {
    const app = buildApp({ release: 'abc123' });
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', release: 'abc123' });
    await app.close();
  });

  it('readiness sin base configurada reporta not_configured', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().database).toBe('not_configured');
    await app.close();
  });

  it('readiness devuelve 503 con error normalizado si la base falla', async () => {
    const failingDb = { query: () => Promise.reject(new Error('boom')) } as never;
    const app = buildApp({ db: failingDb });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.code).toBe('DATABASE');
    expect(body.error.request_id).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('boom');
    await app.close();
  });

  it('propaga x-request-id entrante', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'req-42' },
    });
    expect(res.headers['x-request-id']).toBe('req-42');
    await app.close();
  });
});
