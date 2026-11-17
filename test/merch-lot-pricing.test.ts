import { describe, expect, it } from 'vitest';
import { assertMerchLotReady, reviewMerchLot, type MerchLotOffer } from '../src/modules/merch/lot-pricing.js';

const approved: MerchLotOffer = {
  sku: 'BMERCH-CAMISETA-220-100',
  unitsPerLot: 100,
  netLotCents: 114925,
  grossLotCents: 139059,
  currency: 'EUR',
  catalogStatus: 'active',
  purchaseMode: 'direct',
  priceVerified: true,
  taxVerifiedForDestination: true,
  freightVerifiedForDestination: true,
  productionCapacityConfirmed: true,
  shippingCents: 1200,
};

describe('contrato de precio por lote Merch', () => {
  it('preserva la tarifa del lote, sin recalcular con unitarios redondeados', () => {
    const review = assertMerchLotReady(approved, 2);
    expect(review.units).toBe(200);
    expect(review.subtotalNetCents).toBe(229850);
    expect(review.subtotalGrossCents).toBe(278118);
    expect(review.payableCents).toBe(279318);
    expect(review.blockers).toHaveLength(0);
  });

  it('rechaza cobrar tarifa orientativa o producto no publicado', () => {
    const blocked = reviewMerchLot({
      ...approved, catalogStatus: 'draft', purchaseMode: 'quote_only', priceVerified: false,
      taxVerifiedForDestination: false, shippingCents: null,
      freightVerifiedForDestination: false, productionCapacityConfirmed: false,
    }, 1);
    expect(blocked.payableCents).toBeNull();
    expect(blocked.blockers).toEqual([
      'CATALOG_NOT_ACTIVE', 'QUOTE_REQUIRED', 'PRICE_NOT_VERIFIED',
      'TAX_NOT_VERIFIED', 'FREIGHT_NOT_VERIFIED', 'PRODUCTION_NOT_CONFIRMED',
    ]);
    expect(() => assertMerchLotReady({ ...approved, purchaseMode: 'quote_only' }, 1))
      .toThrow('cotización confirmada');
  });

  it('admite transporte gratis únicamente cuando está validado expresamente', () => {
    expect(assertMerchLotReady({ ...approved, shippingCents: 0 }, 1).payableCents).toBe(139059);
    expect(reviewMerchLot({ ...approved, shippingCents: null }, 1).payableCents).toBeNull();
  });

  it('rechaza lotes fraccionarios, cero, importes inválidos y exceso de cálculo', () => {
    expect(() => reviewMerchLot(approved, 0)).toThrow();
    expect(() => reviewMerchLot(approved, 1.5)).toThrow();
    expect(() => reviewMerchLot({ ...approved, unitsPerLot: 0 }, 1)).toThrow();
    expect(() => reviewMerchLot({ ...approved, netLotCents: -1 }, 1)).toThrow();
    expect(() => reviewMerchLot({ ...approved, grossLotCents: Number.MAX_SAFE_INTEGER }, 2)).toThrow();
  });
});
