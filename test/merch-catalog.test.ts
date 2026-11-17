import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Variant = {
  sku: string;
  lot_units: number;
  net_lot_cents: number;
  gross_lot_cents: number;
  status: string;
};
type Product = {
  slug: string;
  source_page: number;
  price_kind: string;
  status: string;
  sale_mode: string;
  variants: Variant[];
};

const catalog = JSON.parse(readFileSync(
  join(import.meta.dirname, '..', 'data', 'merch_catalog_2026_draft.json'), 'utf8',
)) as { products: Product[]; not_for_live_checkout: boolean; currency: string };

describe('BASSSE Merch catálogo 2026 importado como borrador', () => {
  it('contiene las 21 familias y las 61 variantes del PDF', () => {
    expect(catalog.products).toHaveLength(21);
    expect(catalog.products.reduce((sum, product) => sum + product.variants.length, 0)).toBe(61);
    expect(catalog.currency).toBe('EUR');
  });

  it('no permite venta automática antes de revisar tarifas, IVA, portes y capacidad', () => {
    expect(catalog.not_for_live_checkout).toBe(true);
    for (const product of catalog.products) {
      expect(product.status).toBe('draft');
      expect(product.sale_mode).toBe('quote_only');
      for (const variant of product.variants) expect(variant.status).toBe('draft');
    }
  });

  it('protege los importes originales del lote sin usar unidad redondeada', () => {
    const skus = new Set<string>();
    for (const product of catalog.products) {
      expect(product.source_page).toBeGreaterThanOrEqual(4);
      expect(product.source_page).toBeLessThanOrEqual(19);
      expect(['cerrada', 'orientativa', 'presupuesto']).toContain(product.price_kind);
      if (product.price_kind === 'presupuesto') expect(product.variants).toHaveLength(0);
      for (const variant of product.variants) {
        expect(skus.has(variant.sku)).toBe(false);
        skus.add(variant.sku);
        expect(Number.isSafeInteger(variant.lot_units)).toBe(true);
        expect(variant.lot_units).toBeGreaterThan(0);
        expect(Number.isSafeInteger(variant.net_lot_cents)).toBe(true);
        expect(Number.isSafeInteger(variant.gross_lot_cents)).toBe(true);
        expect(variant.gross_lot_cents).toBeGreaterThan(variant.net_lot_cents);
      }
    }
  });

  it('comprueba tarifas clave contra el catálogo fuente', () => {
    const find = (slug: string, variant: string) =>
      catalog.products.find((p) => p.slug === slug)?.variants.find((v) => v.name === variant);
    expect(find('camisetas-oversize', '220 g · 100 uds')?.net_lot_cents).toBe(114925);
    expect(find('camisetas-oversize', '220 g · 100 uds')?.gross_lot_cents).toBe(139059);
    expect(find('lanyards', 'Transfer · mosq. gris · 100 uds')?.gross_lot_cents).toBe(18000);
    expect(find('pegatinas-estandar', 'Estándar · 6000 uds')?.gross_lot_cents).toBe(39514);
  });
});
