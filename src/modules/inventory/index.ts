import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../../db/tx.js';
import { AppError } from '../../http/errors.js';
import type { InventoryPort, ReservationItem } from '../ports.js';

interface ReservationRow {
  variant_id: string;
  quantity: number;
}

/** Agrupa cantidades por variante y ordena por variantId (orden estable de bloqueo). */
function normalize(items: ReservationItem[]): ReservationItem[] {
  const totals = new Map<string, number>();
  for (const { variantId, quantity } of items) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError('VALIDATION', 'INVALID_QUANTITY', 'Cantidad inválida', { variantId, quantity });
    }
    totals.set(variantId, (totals.get(variantId) ?? 0) + quantity);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([variantId, quantity]) => ({ variantId, quantity }));
}

async function reserve(client: PoolClient, orderId: string, items: ReservationItem[], expiresAt: Date): Promise<void> {
  // Todo-o-nada: si una línea falla se lanza y el llamante hace rollback de toda la transacción.
  for (const { variantId, quantity } of normalize(items)) {
    const inserted = await client.query(
      `insert into stock_reservations (order_id, variant_id, quantity, expires_at) values ($1, $2, $3, $4)
       on conflict (order_id, variant_id) do nothing`,
      [orderId, variantId, quantity, expiresAt],
    );
    // Ya reservada antes para este pedido: idempotente, no se vuelve a sumar.
    if (inserted.rowCount === 0) continue;
    const updated = await client.query(
      `update inventory set reserved = reserved + $2, updated_at = now()
       where variant_id = $1 and on_hand - reserved >= $2`,
      [variantId, quantity],
    );
    if (updated.rowCount === 0) {
      throw new AppError('CONFLICT', 'OUT_OF_STOCK', 'Stock insuficiente', { variantId });
    }
  }
}

/** Reservas activas del pedido bloqueadas en orden estable. */
async function lockActive(client: PoolClient, orderId: string): Promise<ReservationRow[]> {
  const { rows } = await client.query<ReservationRow>(
    `select variant_id, quantity from stock_reservations
     where order_id = $1 and status = 'active'
     order by variant_id
     for update`,
    [orderId],
  );
  return rows;
}

async function commit(client: PoolClient, orderId: string): Promise<void> {
  for (const r of await lockActive(client, orderId)) {
    await client.query(
      `update inventory set on_hand = on_hand - $2, reserved = reserved - $2, updated_at = now()
       where variant_id = $1`,
      [r.variant_id, r.quantity],
    );
    await client.query(
      `update stock_reservations set status = 'committed' where order_id = $1 and variant_id = $2`,
      [orderId, r.variant_id],
    );
  }
}

async function releaseRow(client: PoolClient, orderId: string, r: ReservationRow): Promise<void> {
  await client.query('update inventory set reserved = reserved - $2, updated_at = now() where variant_id = $1', [
    r.variant_id,
    r.quantity,
  ]);
  await client.query(
    `update stock_reservations set status = 'released' where order_id = $1 and variant_id = $2`,
    [orderId, r.variant_id],
  );
}

async function release(client: PoolClient, orderId: string): Promise<void> {
  for (const r of await lockActive(client, orderId)) await releaseRow(client, orderId, r);
}

export const inventoryPort: InventoryPort = { reserve, commit, release };

/**
 * Libera reservas activas caducadas (expires_at <= now). Cada reserva en su propia transacción;
 * `skip locked` evita bloquearse con checkouts o con otro worker en paralelo. Devuelve cuántas liberó.
 */
export async function releaseExpired(pool: Pool, now: Date): Promise<number> {
  let released = 0;
  for (;;) {
    const done = await withTransaction(pool, async (client) => {
      const { rows } = await client.query<ReservationRow & { order_id: string }>(
        `select order_id, variant_id, quantity from stock_reservations
         where status = 'active' and expires_at <= $1
         order by expires_at, order_id, variant_id
         limit 1
         for update skip locked`,
        [now],
      );
      const row = rows[0];
      if (!row) return true;
      await releaseRow(client, row.order_id, row);
      return false;
    });
    if (done) return released;
    released++;
  }
}
