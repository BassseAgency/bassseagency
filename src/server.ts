import { Pool } from 'pg';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 })
  : undefined;

const app = buildApp({ db, release: process.env.RELEASE_SHA });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db?.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port, host });
