import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../http/errors.js';
import type { AppModule } from '../index.js';

export interface VariantView {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  currency: string;
  available: number;
}

export interface ProductView {
  id: string;
  slug: string;
  name: string;
  description: string;
  variants: VariantView[];
}

interface Row {
  product_id: string;
  slug: string;
  product_name: string;
  description: string;
  variant_id: string | null;
  sku: string | null;
  variant_name: string | null;
  price_cents: number | null;
  currency: string | null;
  available: number | null;
}

const slugParams = z.object({ slug: z.string().min(1).max(200) });

// Productos activos con variantes; available = on_hand - reserved (0 si no hay fila de inventario).
const BASE_QUERY = `
  select p.id as product_id, p.slug, p.name as product_name, p.description,
         v.id as variant_id, v.sku, v.name as variant_name, v.price_cents, v.currency,
         coalesce(i.on_hand - i.reserved, 0)::int as available
  from products p
  left join product_variants v on v.product_id = p.id
  left join inventory i on i.variant_id = v.id
  where p.status = 'active'`;

function groupRows(rows: Row[]): ProductView[] {
  const byId = new Map<string, ProductView>();
  for (const r of rows) {
    let product = byId.get(r.product_id);
    if (!product) {
      product = { id: r.product_id, slug: r.slug, name: r.product_name, description: r.description, variants: [] };
      byId.set(r.product_id, product);
    }
    if (r.variant_id !== null) {
      product.variants.push({
        id: r.variant_id,
        sku: r.sku ?? '',
        name: r.variant_name ?? '',
        priceCents: r.price_cents ?? 0,
        currency: r.currency ?? '',
        available: r.available ?? 0,
      });
    }
  }
  return [...byId.values()];
}

export async function listProducts(db: Pool): Promise<ProductView[]> {
  const { rows } = await db.query<Row>(`${BASE_QUERY} order by p.created_at, p.slug, v.sku`);
  return groupRows(rows);
}

export async function getProductBySlug(db: Pool, slug: string): Promise<ProductView> {
  const { rows } = await db.query<Row>(`${BASE_QUERY} and p.slug = $1 order by v.sku`, [slug]);
  const product = groupRows(rows)[0];
  if (!product) throw new AppError('NOT_FOUND', 'PRODUCT_NOT_FOUND', 'Producto no encontrado');
  return product;
}

export const catalogModule: AppModule = (app, { db }) => {
  app.get('/products', async () => ({ products: await listProducts(db) }));

  app.get('/products/:slug', async (req) => {
    const { slug } = slugParams.parse(req.params);
    return getProductBySlug(db, slug);
  });
};
