import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { AppError } from './http/errors.js';
import { releaseExpired } from './modules/inventory/index.js';
import {
  processOutboxBatch,
  type OutboxHandler,
  type ProcessOutboxOptions,
  type ProcessOutboxResult,
} from './modules/notifications/outbox.js';
import { cancelAbandonedOrders } from './modules/orders/index.js';

/** Opciones del outbox fuera del worker (cron y envío tras el pago). Mismos valores por defecto que el worker. */
export const DEFAULT_OUTBOX_OPTIONS: ProcessOutboxOptions = {
  batchSize: 20,
  lockMs: 60_000,
  maxAttempts: 10,
  handlerTimeoutMs: 10_000,
};

export interface MaintenanceResult {
  released: number;
  cancelled: number;
  outbox: ProcessOutboxResult;
}

/**
 * Una pasada de mantenimiento: libera reservas caducadas, cancela pedidos que se quedaron sin
 * reserva y procesa un lote del outbox. Es lo que hace el worker en bucle, en una sola llamada.
 */
export async function runMaintenance(
  pool: Pool,
  handlers: Record<string, OutboxHandler>,
  outbox: ProcessOutboxOptions,
  now: Date = new Date(),
): Promise<MaintenanceResult> {
  const released = await releaseExpired(pool, now);
  const cancelled = await cancelAbandonedOrders(pool);
  return { released, cancelled, outbox: await processOutboxBatch(pool, handlers, outbox) };
}

/**
 * GET /internal/worker-tick para el cron de Vercel, que envía `Authorization: Bearer <CRON_SECRET>`.
 * El sistema no depende de su frecuencia: las reservas caducadas también se liberan al reservar
 * y el email sale tras el pago. El cron recoge lo que quede (reintentos, pedidos abandonados).
 */
export function registerWorkerTick(
  app: FastifyInstance,
  db: Pool,
  handlers: Record<string, OutboxHandler>,
  secret: string,
): void {
  app.get('/internal/worker-tick', async (req) => {
    if (!bearerMatches(req.headers.authorization, secret)) {
      throw new AppError('AUTHENTICATION', 'UNAUTHORIZED', 'No autorizado');
    }
    return runMaintenance(db, handlers, DEFAULT_OUTBOX_OPTIONS);
  });
}

function bearerMatches(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? '');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
