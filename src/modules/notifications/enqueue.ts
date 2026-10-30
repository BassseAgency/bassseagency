import type { PoolClient } from 'pg';

export interface OutboxMessage {
  topic: string;
  /** Clave de deduplicación, p. ej. `order:<id>:confirmation`. Repetir el enqueue no duplica. */
  dedupeKey: string;
  payload: Record<string, unknown>;
}

/**
 * Encola un efecto externo dentro de la transacción del llamante (transactional outbox).
 * Devuelve true si se insertó, false si ya existía.
 */
export async function enqueueOutbox(client: PoolClient, msg: OutboxMessage): Promise<boolean> {
  const { rowCount } = await client.query(
    `insert into outbox (topic, dedupe_key, payload) values ($1, $2, $3)
     on conflict (dedupe_key) do nothing`,
    [msg.topic, msg.dedupeKey, JSON.stringify(msg.payload)],
  );
  return rowCount === 1;
}
