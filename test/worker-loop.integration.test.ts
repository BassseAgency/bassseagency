import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../src/db/tx.js';
import { enqueueOutbox } from '../src/modules/notifications/enqueue.js';
import { startWorkerLoop, type WorkerLogger } from '../src/worker-loop.js';
import { freshDb, testDbUrl } from './helpers/db.js';

const silent: WorkerLogger = { info: () => undefined, error: () => undefined };

describe.skipIf(!testDbUrl)('worker loop', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await freshDb();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('procesa el outbox, ejecuta tareas periódicas y para esperando el lote en curso', async () => {
    await withTransaction(pool, (c) => enqueueOutbox(c, { topic: 't', dedupeKey: 'w1', payload: {} }));

    let finishedHandler = false;
    let taskRuns = 0;
    let taskRan: () => void = () => undefined;
    const taskStarted = new Promise<void>((r) => {
      taskRan = r;
    });
    let release: () => void = () => undefined;
    const handlerStarted = new Promise<void>((started) => {
      release = started;
    });

    const loop = startWorkerLoop({
      pool,
      handlers: {
        t: async () => {
          release();
          await new Promise((r) => setTimeout(r, 100));
          finishedHandler = true;
        },
      },
      outbox: { batchSize: 10, lockMs: 5_000, maxAttempts: 3, handlerTimeoutMs: 1_000 },
      pollMs: 10,
      periodicTasks: [
        {
          name: 'contador',
          intervalMs: 5,
          run: () => {
            taskRuns += 1;
            taskRan();
            return Promise.resolve();
          },
        },
      ],
      logger: silent,
    });

    await Promise.all([handlerStarted, taskStarted]);
    await loop.stop();
    // stop() espera a que termine el lote en curso.
    expect(finishedHandler).toBe(true);
    expect(taskRuns).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query<{ status: string }>(`select status from outbox where dedupe_key = 'w1'`);
    expect(rows[0]?.status).toBe('sent');
  });
});
