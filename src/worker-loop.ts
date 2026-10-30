import type { Pool } from 'pg';
import {
  processOutboxBatch,
  type OutboxHandler,
  type ProcessOutboxOptions,
} from './modules/notifications/outbox.js';

export interface WorkerLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Tarea periódica del worker (p. ej. liberar reservas caducadas). Debe ser idempotente. */
export interface PeriodicTask {
  name: string;
  intervalMs: number;
  run(pool: Pool): Promise<void>;
}

export interface WorkerLoopOptions {
  pool: Pool;
  handlers: Record<string, OutboxHandler>;
  outbox: ProcessOutboxOptions;
  pollMs: number;
  periodicTasks: PeriodicTask[];
  logger: WorkerLogger;
}

export interface WorkerLoop {
  /** Deja de reclamar trabajo y espera a que terminen el lote y las tareas en curso. */
  stop(): Promise<void>;
}

function errorInfo(err: unknown): Record<string, unknown> {
  return err instanceof Error ? { err: err.message, err_name: err.name } : { err: String(err) };
}

export function startWorkerLoop(opts: WorkerLoopOptions): WorkerLoop {
  const controller = new AbortController();
  const { signal } = controller;
  // Función (no propiedad) para que TS no estreche el valor entre awaits.
  const stopped = () => signal.aborted;

  // Espera interrumpible por stop().
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done);
    });

  const outboxLoop = async () => {
    while (!stopped()) {
      let full = false;
      try {
        const res = await processOutboxBatch(opts.pool, opts.handlers, opts.outbox);
        if (res.claimed > 0) opts.logger.info({ job: 'outbox', ...res }, 'outbox batch');
        // Lote lleno: probablemente queda más trabajo, seguimos sin esperar.
        full = res.claimed >= opts.outbox.batchSize;
      } catch (err) {
        opts.logger.error({ job: 'outbox', ...errorInfo(err) }, 'outbox batch failed');
      }
      if (!full) await sleep(opts.pollMs);
    }
  };

  const taskLoop = async (task: PeriodicTask) => {
    while (!stopped()) {
      await sleep(task.intervalMs);
      if (stopped()) break;
      const started = Date.now();
      try {
        await task.run(opts.pool);
        opts.logger.info({ job: task.name, duration_ms: Date.now() - started }, 'periodic task done');
      } catch (err) {
        opts.logger.error({ job: task.name, ...errorInfo(err) }, 'periodic task failed');
      }
    }
  };

  const running = Promise.all([outboxLoop(), ...opts.periodicTasks.map(taskLoop)]);

  return {
    async stop() {
      controller.abort();
      await running;
    },
  };
}
