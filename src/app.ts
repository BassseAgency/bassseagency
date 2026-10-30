import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerErrorHandler } from './http/errors.js';
import { cartPort } from './modules/cart/index.js';
import { modules } from './modules/index.js';
import { inventoryPort } from './modules/inventory/index.js';
import { createOrdersModule, MIN_RESERVATION_TTL_MS } from './modules/orders/index.js';
import type { PaymentProvider } from './modules/payments/provider.js';

export interface AppDeps {
  /** Pool de Postgres. Si no se pasa, /health/ready reporta `database: "not_configured"`. */
  db?: Pool;
  /** Versión de release (SHA del commit), para trazabilidad en logs y health. */
  release?: string;
  /** Proveedor de pagos. Sin él no se registran /checkout ni el webhook. */
  payments?: PaymentProvider;
  /** URL pública de la tienda (success/cancel de Stripe). */
  appUrl?: string;
  reservationTtlMs?: number;
}

const READY_TIMEOUT_MS = 2000;

export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
  });

  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    done();
  });

  registerErrorHandler(app);

  if (deps.db) {
    for (const register of modules) register(app, { db: deps.db });
    if (deps.payments) {
      createOrdersModule({
        payments: deps.payments,
        cart: cartPort,
        inventory: inventoryPort,
        reservationTtlMs: deps.reservationTtlMs ?? MIN_RESERVATION_TTL_MS,
        appUrl: deps.appUrl ?? 'http://localhost:3000',
      })(app, { db: deps.db });
    }
  }

  app.get('/health/live', () => ({ status: 'ok', release: deps.release ?? 'dev' }));

  app.get('/health/ready', async (req, reply) => {
    if (!deps.db) {
      return { status: 'ok', database: 'not_configured', release: deps.release ?? 'dev' };
    }
    try {
      await withTimeout(deps.db.query('select 1'), READY_TIMEOUT_MS);
      return { status: 'ok', database: 'up', release: deps.release ?? 'dev' };
    } catch (err) {
      req.log.error({ err }, 'database readiness check failed');
      return reply.code(503).send({
        error: { code: 'DATABASE', message: 'Base de datos no disponible', request_id: req.id },
      });
    }
  });

  return app;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout after ${String(ms)}ms`));
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
