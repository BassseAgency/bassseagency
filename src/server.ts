import { join } from 'node:path';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';
import { StripePaymentProvider, stripeConfigFromEnv } from './modules/payments/stripe.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 })
  : undefined;

// Migraciones al arrancar: el advisory lock del runner evita que dos instancias migren a la vez.
// El lock es de sesión, así que se usa la conexión directa (DATABASE_URL_UNPOOLED) si existe:
// detrás de un pooler en modo transacción la sesión no está garantizada (Neon).
if (db && process.env.MIGRATE_ON_START === 'true') {
  const migrationsDir = join(import.meta.dirname, '..', 'migrations');
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  if (directUrl) {
    const direct = new Pool({ connectionString: directUrl, connectionTimeoutMillis: 5000, max: 1 });
    try {
      await migrate(direct, migrationsDir);
    } finally {
      await direct.end();
    }
  } else {
    await migrate(db, migrationsDir);
  }
}

// Sin claves de Stripe la tienda arranca sin checkout (catálogo y carrito siguen disponibles).
const payments =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ? new StripePaymentProvider(stripeConfigFromEnv())
    : undefined;

const app = buildApp({
  db,
  release: process.env.RELEASE_SHA,
  payments,
  appUrl: process.env.APP_URL,
  reservationTtlMs: process.env.RESERVATION_TTL_MS ? Number(process.env.RESERVATION_TTL_MS) : undefined,
});
if (!payments) app.log.warn('STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET no definidas: checkout desactivado');

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db?.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port, host });
