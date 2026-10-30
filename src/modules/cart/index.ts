import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../../db/tx.js';
import { AppError } from '../../http/errors.js';
import type { AppModule } from '../index.js';
import type { CartLine, CartPort } from '../ports.js';

const cartParams = z.object({ id: z.string().uuid() });
const putItemBody = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(0).max(999),
});

export interface CartView {
  id: string;
  lines: CartLine[];
  subtotalCents: number;
}

interface LineRow {
  variant_id: string;
  sku: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
}

type Queryable = Pick<PoolClient, 'query'>;

async function assertCartExists(q: Queryable, cartId: string, lock = false): Promise<void> {
  const { rowCount } = await q.query(`select 1 from carts where id = $1${lock ? ' for update' : ''}`, [cartId]);
  if (rowCount === 0) throw new AppError('NOT_FOUND', 'CART_NOT_FOUND', 'Carrito no encontrado');
}

async function readLines(q: Queryable, cartId: string): Promise<CartLine[]> {
  await assertCartExists(q, cartId);
  const { rows } = await q.query<LineRow>(
    `select ci.variant_id, v.sku, v.name, v.price_cents, v.currency, ci.quantity
     from cart_items ci join product_variants v on v.id = ci.variant_id
     where ci.cart_id = $1
     order by v.sku`,
    [cartId],
  );
  return rows.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    name: r.name,
    unitPriceCents: r.price_cents,
    currency: r.currency,
    quantity: r.quantity,
  }));
}

/** Implementación de CartPort: líneas con precio vigente. */
export const cartPort: CartPort = {
  getCartLines: (client, cartId) => readLines(client, cartId),
};

export async function createCart(db: Pool): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into carts default values returning id');
  const id = rows[0]?.id;
  if (!id) throw new AppError('INTERNAL', 'CART_CREATE_FAILED', 'No se pudo crear el carrito');
  return id;
}

export async function getCart(db: Pool, cartId: string): Promise<CartView> {
  const lines = await readLines(db, cartId);
  const subtotalCents = lines.reduce((acc, l) => acc + l.unitPriceCents * l.quantity, 0);
  return { id: cartId, lines, subtotalCents };
}

/** Fija la cantidad de una línea (upsert). quantity 0 elimina la línea. */
export async function setCartItem(db: Pool, cartId: string, variantId: string, quantity: number): Promise<void> {
  await withTransaction(db, async (client) => {
    await assertCartExists(client, cartId, true);
    if (quantity === 0) {
      await client.query('delete from cart_items where cart_id = $1 and variant_id = $2', [cartId, variantId]);
    } else {
      const { rowCount } = await client.query('select 1 from product_variants where id = $1', [variantId]);
      if (rowCount === 0) throw new AppError('NOT_FOUND', 'VARIANT_NOT_FOUND', 'Variante no encontrada');
      await client.query(
        `insert into cart_items (cart_id, variant_id, quantity) values ($1, $2, $3)
         on conflict (cart_id, variant_id) do update set quantity = excluded.quantity`,
        [cartId, variantId, quantity],
      );
    }
    await client.query('update carts set updated_at = now() where id = $1', [cartId]);
  });
}

export const cartModule: AppModule = (app, { db }) => {
  app.post('/carts', async (_req, reply) => {
    const id = await createCart(db);
    return reply.code(201).send({ id });
  });

  app.get('/carts/:id', async (req) => {
    const { id } = cartParams.parse(req.params);
    return getCart(db, id);
  });

  app.put('/carts/:id/items', async (req) => {
    const { id } = cartParams.parse(req.params);
    const { variantId, quantity } = putItemBody.parse(req.body);
    await setCartItem(db, id, variantId, quantity);
    return getCart(db, id);
  });
};
