import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../src/db/tx.js';
import { enqueueOutbox } from '../src/modules/notifications/enqueue.js';
import {
  computeBackoffMs,
  processOutboxBatch,
  sanitizeError,
  type OutboxHandler,
  type ProcessOutboxOptions,
} from '../src/modules/notifications/outbox.js';
import { freshDb, testDbUrl } from './helpers/db.js';

interface Row {
  id: string;
  status: string;
  attempts: number;
  next_attempt_at: Date;
  locked_until: Date | null;
  last_error: string | null;
  sent_at: Date | null;
}

// Reloj fijo algo por delante del real, para que next_attempt_at (default now()) ya haya vencido.
const T0 = new Date(Date.now() + 60_000);
const at = (ms: number) => () => new Date(T0.getTime() + ms);

const baseOpts: ProcessOutboxOptions = {
  batchSize: 10,
  lockMs: 30_000,
  maxAttempts: 3,
  handlerTimeoutMs: 1_000,
  now: at(0),
  random: () => 0.5,
};

describe.skipIf(!testDbUrl)('outbox: processOutboxBatch', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await freshDb();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate outbox');
  });

  const enqueue = (dedupeKey: string, topic = 'test.ok', payload: Record<string, unknown> = {}) =>
    withTransaction(pool, (c) => enqueueOutbox(c, { topic, dedupeKey, payload }));

  const rowOf = async (dedupeKey: string): Promise<Row> => {
    const { rows } = await pool.query<Row>(
      `select id::text, status, attempts, next_attempt_at, locked_until, last_error, sent_at
       from outbox where dedupe_key = $1`,
      [dedupeKey],
    );
    const row = rows[0];
    if (!row) throw new Error(`fila ${dedupeKey} no encontrada`);
    return row;
  };

  const ok: OutboxHandler = () => Promise.resolve();
  const boom: OutboxHandler = () => Promise.reject(new Error('smtp caído token=abc123 a@b.com'));

  it('éxito: marca sent, sent_at y libera el lease', async () => {
    await enqueue('k1', 'test.ok', { x: 1 });
    const seen: unknown[] = [];
    const res = await processOutboxBatch(
      pool,
      {
        'test.ok': (payload, ctx) => {
          seen.push({ payload, dedupeKey: ctx.dedupeKey, attempt: ctx.attempt });
          return Promise.resolve();
        },
      },
      baseOpts,
    );
    expect(res).toEqual({ claimed: 1, sent: 1, failed: 0, dead: 0 });
    expect(seen).toEqual([{ payload: { x: 1 }, dedupeKey: 'k1', attempt: 1 }]);
    const row = await rowOf('k1');
    expect(row.status).toBe('sent');
    expect(row.sent_at?.getTime()).toBe(T0.getTime());
    expect(row.locked_until).toBeNull();

    // No se vuelve a entregar.
    const again = await processOutboxBatch(pool, { 'test.ok': ok }, { ...baseOpts, now: at(3_600_000) });
    expect(again.claimed).toBe(0);
  });

  it('fallo: programa reintento con backoff y respeta next_attempt_at', async () => {
    await enqueue('k2');
    const res = await processOutboxBatch(pool, { 'test.ok': boom }, baseOpts);
    expect(res).toEqual({ claimed: 1, sent: 0, failed: 1, dead: 0 });

    const delay = computeBackoffMs(1, () => 0.5);
    expect(delay).toBe(750);
    const row = await rowOf('k2');
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.locked_until).toBeNull();
    expect(row.next_attempt_at.getTime()).toBe(T0.getTime() + delay);
    // Error guardado sin secretos ni emails.
    expect(row.last_error).toContain('smtp caído');
    expect(row.last_error).not.toContain('abc123');
    expect(row.last_error).not.toContain('a@b.com');

    const early = await processOutboxBatch(pool, { 'test.ok': ok }, { ...baseOpts, now: at(delay - 1) });
    expect(early.claimed).toBe(0);
    const onTime = await processOutboxBatch(pool, { 'test.ok': ok }, { ...baseOpts, now: at(delay) });
    expect(onTime).toEqual({ claimed: 1, sent: 1, failed: 0, dead: 0 });
  });

  it('tras maxAttempts queda dead y no se reintenta', async () => {
    await enqueue('k3');
    let clock = 0;
    const results = [];
    for (let i = 0; i < baseOpts.maxAttempts; i++) {
      results.push(await processOutboxBatch(pool, { 'test.ok': boom }, { ...baseOpts, now: at(clock) }));
      clock += 20 * 60 * 1000; // más que el tope de backoff
    }
    expect(results.map((r) => [r.failed, r.dead])).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
    const row = await rowOf('k3');
    expect(row.status).toBe('dead');
    expect(row.attempts).toBe(3);
    const after = await processOutboxBatch(pool, { 'test.ok': ok }, { ...baseOpts, now: at(clock) });
    expect(after.claimed).toBe(0);
  });

  it('topic sin handler cuenta como fallo NO_HANDLER', async () => {
    await enqueue('k4', 'test.unknown');
    const res = await processOutboxBatch(pool, { 'test.ok': ok }, baseOpts);
    expect(res).toEqual({ claimed: 1, sent: 0, failed: 1, dead: 0 });
    const row = await rowOf('k4');
    expect(row.last_error).toMatch(/^NO_HANDLER/);
  });

  it('un topic que coincide con una propiedad de Object.prototype no se trata como handler', async () => {
    await enqueue('k4b', 'constructor');
    const res = await processOutboxBatch(pool, {}, baseOpts);
    expect(res.failed).toBe(1);
    expect((await rowOf('k4b')).last_error).toMatch(/^NO_HANDLER/);
  });

  it('timeout del handler cuenta como fallo y aborta la señal', async () => {
    await enqueue('k5');
    let aborted = false;
    const slow: OutboxHandler = (_payload, ctx) =>
      new Promise<void>((resolve) => {
        ctx.signal.addEventListener('abort', () => {
          aborted = true;
        });
        setTimeout(resolve, 2_000);
      });
    const res = await processOutboxBatch(pool, { 'test.ok': slow }, { ...baseOpts, handlerTimeoutMs: 50 });
    expect(res).toEqual({ claimed: 1, sent: 0, failed: 1, dead: 0 });
    expect(aborted).toBe(true);
    const row = await rowOf('k5');
    expect(row.last_error).toMatch(/^HANDLER_TIMEOUT/);
    expect(row.attempts).toBe(1);
  });

  it('concurrencia: dos lotes en paralelo entregan cada mensaje exactamente una vez', async () => {
    const n = 40;
    for (let i = 0; i < n; i++) await enqueue(`c${String(i)}`);
    const deliveries = new Map<string, number>();
    const handler: OutboxHandler = async (_payload, ctx) => {
      deliveries.set(ctx.dedupeKey, (deliveries.get(ctx.dedupeKey) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5));
    };
    const opts = { ...baseOpts, batchSize: 25 };
    const results = await Promise.all([
      processOutboxBatch(pool, { 'test.ok': handler }, opts),
      processOutboxBatch(pool, { 'test.ok': handler }, opts),
      processOutboxBatch(pool, { 'test.ok': handler }, opts),
    ]);
    // Lo que quede (si algún lote no llegó a ver filas) se drena después.
    let rest = await processOutboxBatch(pool, { 'test.ok': handler }, opts);
    while (rest.claimed > 0) rest = await processOutboxBatch(pool, { 'test.ok': handler }, opts);

    const totalClaimed = results.reduce((s, r) => s + r.claimed, 0);
    expect(totalClaimed).toBeLessThanOrEqual(n);
    expect(deliveries.size).toBe(n);
    expect([...deliveries.values()].every((c) => c === 1)).toBe(true);
    const { rows } = await pool.query<{ count: string }>(`select count(*) from outbox where status = 'sent'`);
    expect(Number(rows[0]?.count)).toBe(n);
  });

  it('un lease vigente bloquea la fila y uno caducado se puede reclamar', async () => {
    await enqueue('k6');
    await pool.query(`update outbox set locked_until = $1 where dedupe_key = 'k6'`, [
      new Date(T0.getTime() + 10_000),
    ]);
    const blocked = await processOutboxBatch(pool, { 'test.ok': ok }, baseOpts);
    expect(blocked.claimed).toBe(0);

    await pool.query(`update outbox set locked_until = $1 where dedupe_key = 'k6'`, [
      new Date(T0.getTime() - 1),
    ]);
    const reclaimed = await processOutboxBatch(pool, { 'test.ok': ok }, baseOpts);
    expect(reclaimed).toEqual({ claimed: 1, sent: 1, failed: 0, dead: 0 });
  });

  it('si el lease se pierde durante el handler, no pisa el resultado del otro worker', async () => {
    await enqueue('k7');
    const res = await processOutboxBatch(
      pool,
      {
        'test.ok': async () => {
          // Simula que otro worker reclamó la fila tras caducar nuestro lease.
          await pool.query(`update outbox set locked_until = $1 where dedupe_key = 'k7'`, [
            new Date(T0.getTime() + 99_000),
          ]);
        },
      },
      baseOpts,
    );
    expect(res).toEqual({ claimed: 1, sent: 0, failed: 0, dead: 0 });
    expect((await rowOf('k7')).status).toBe('pending');
  });

  it('rechaza lockMs <= handlerTimeoutMs', async () => {
    await expect(
      processOutboxBatch(pool, {}, { ...baseOpts, lockMs: 1_000, handlerTimeoutMs: 1_000 }),
    ).rejects.toThrow(/lockMs/);
  });
});

describe('outbox: backoff y saneado de errores', () => {
  it('backoff exponencial con jitter y tope de 15 min', () => {
    expect(computeBackoffMs(1, () => 0)).toBe(500);
    expect(computeBackoffMs(1, () => 1)).toBe(1_000);
    expect(computeBackoffMs(4, () => 1)).toBe(8_000);
    expect(computeBackoffMs(50, () => 1)).toBe(15 * 60 * 1000);
    expect(computeBackoffMs(50, () => 0)).toBe(7.5 * 60 * 1000);
  });

  it('trunca y redacta secretos', () => {
    const msg = sanitizeError(new Error(`sk_live_ABC123 Bearer xyz.abc postgres://u:pw@h/db ${'x'.repeat(1000)}`));
    expect(msg.length).toBeLessThanOrEqual(500);
    expect(msg).not.toContain('sk_live_ABC123');
    expect(msg).not.toContain('xyz.abc');
    expect(msg).not.toContain(':pw@');
  });
});
