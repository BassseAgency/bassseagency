import { Pool } from 'pg';
import { z } from 'zod';
import { releaseExpired } from './modules/inventory/index.js';
import { cancelAbandonedOrders } from './modules/orders/index.js';
import {
  LogEmailSender,
  ORDER_CONFIRMATION_TOPIC,
  orderConfirmationHandler,
} from './modules/notifications/email.js';
import { startWorkerLoop, type PeriodicTask, type WorkerLogger } from './worker-loop.js';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    RELEASE_SHA: z.string().optional(),
    WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(20),
    OUTBOX_LOCK_MS: z.coerce.number().int().positive().default(60_000),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    OUTBOX_HANDLER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    RESERVATION_SWEEP_MS: z.coerce.number().int().positive().default(60_000),
  })
  .refine((e) => e.OUTBOX_LOCK_MS > e.OUTBOX_HANDLER_TIMEOUT_MS, {
    message: 'OUTBOX_LOCK_MS debe ser mayor que OUTBOX_HANDLER_TIMEOUT_MS',
  })
  .parse(process.env);

// Logs JSON a stdout (ADR 0001, §13).
const write = (level: string, obj: Record<string, unknown>, msg: string) => {
  process.stdout.write(
    `${JSON.stringify({ level, time: new Date().toISOString(), release: env.RELEASE_SHA, ...obj, msg })}\n`,
  );
};
const logger: WorkerLogger = {
  info: (obj, msg) => {
    write('info', obj, msg);
  },
  error: (obj, msg) => {
    write('error', obj, msg);
  },
};

const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 2000 });

// Tareas periódicas. Las reservas caducadas se liberan aunque Stripe no envíe checkout.session.expired,
// y después se cancelan los pedidos pendientes que se han quedado sin reserva (pago diferido no llegado).
const periodicTasks: PeriodicTask[] = [
  {
    name: 'release-expired-reservations',
    intervalMs: env.RESERVATION_SWEEP_MS,
    run: async (p) => {
      const released = await releaseExpired(p, new Date());
      const cancelled = await cancelAbandonedOrders(p);
      if (released > 0 || cancelled > 0) logger.info({ released, cancelled }, 'expired reservations released');
    },
  },
];

const loop = startWorkerLoop({
  pool,
  handlers: {
    [ORDER_CONFIRMATION_TOPIC]: orderConfirmationHandler(new LogEmailSender(logger)),
  },
  outbox: {
    batchSize: env.OUTBOX_BATCH_SIZE,
    lockMs: env.OUTBOX_LOCK_MS,
    maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
    handlerTimeoutMs: env.OUTBOX_HANDLER_TIMEOUT_MS,
  },
  pollMs: env.WORKER_POLL_MS,
  periodicTasks,
  logger,
});
logger.info({ poll_ms: env.WORKER_POLL_MS, tasks: periodicTasks.map((t) => t.name) }, 'worker started');

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  await loop.stop();
  await pool.end();
  logger.info({}, 'worker stopped');
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
