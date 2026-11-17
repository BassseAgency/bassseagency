import { AppError } from '../../http/errors.js';

/**
 * Contrato puro de precios por lotes; no crea pedidos, pagos ni movimientos de stock.
 * Los importes se conservan como céntimos del lote completo, nunca precios unitarios
 * redondeados y multiplicados. La autorización final de checkout sigue en el servidor.
 */
export interface MerchLotOffer {
  sku: string;
  unitsPerLot: number;
  netLotCents: number;
  grossLotCents: number;
  currency: 'EUR';
  catalogStatus: 'draft' | 'active' | 'archived';
  purchaseMode: 'quote_only' | 'direct';
  priceVerified: boolean;
  taxVerifiedForDestination: boolean;
  freightVerifiedForDestination: boolean;
  productionCapacityConfirmed: boolean;
  /** Total de portes por pedido; null significa pendiente de cotizar. */
  shippingCents: number | null;
}

export interface LotReview {
  sku: string;
  lots: number;
  units: number;
  currency: 'EUR';
  subtotalNetCents: number;
  subtotalGrossCents: number;
  shippingCents: number | null;
  payableCents: number | null;
  blockers: string[];
}

function safeCents(value: number, field: string, allowZero = true): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new AppError('VALIDATION', 'INVALID_MERCH_PRICE', `Importe inválido: ${field}`);
  }
}

function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (!Number.isSafeInteger(result)) {
    throw new AppError('VALIDATION', 'MERCH_PRICE_OVERFLOW', 'Importe fuera del rango admitido');
  }
  return result;
}

/**
 * Prepara una vista de revisión; ninguna aprobación puede inferirse de un precio
 * publicado en un PDF. El campo payableCents solo se devuelve con todos los
 * bloqueos resueltos.
 */
export function reviewMerchLot(offer: MerchLotOffer, lots: number): LotReview {
  if (!Number.isSafeInteger(lots) || lots <= 0 || lots > 1000) {
    throw new AppError('VALIDATION', 'INVALID_LOT_COUNT', 'Número de lotes inválido');
  }
  if (!Number.isSafeInteger(offer.unitsPerLot) || offer.unitsPerLot <= 0) {
    throw new AppError('VALIDATION', 'INVALID_LOT_SIZE', 'Tamaño de lote inválido');
  }
  if (!offer.sku.trim()) {
    throw new AppError('VALIDATION', 'INVALID_MERCH_SKU', 'Referencia inválida');
  }
  if (offer.currency !== 'EUR') {
    throw new AppError('VALIDATION', 'UNSUPPORTED_CURRENCY', 'Moneda no admitida');
  }
  safeCents(offer.netLotCents, 'netLotCents');
  safeCents(offer.grossLotCents, 'grossLotCents', false);
  if (offer.grossLotCents < offer.netLotCents) {
    throw new AppError('VALIDATION', 'INVALID_MERCH_PRICE', 'Importe bruto inferior al neto');
  }
  if (offer.shippingCents !== null) safeCents(offer.shippingCents, 'shippingCents');

  const units = safeMultiply(offer.unitsPerLot, lots);
  const subtotalNetCents = safeMultiply(offer.netLotCents, lots);
  const subtotalGrossCents = safeMultiply(offer.grossLotCents, lots);
  const blockers: string[] = [];

  if (offer.catalogStatus !== 'active') blockers.push('CATALOG_NOT_ACTIVE');
  if (offer.purchaseMode !== 'direct') blockers.push('QUOTE_REQUIRED');
  if (!offer.priceVerified) blockers.push('PRICE_NOT_VERIFIED');
  if (!offer.taxVerifiedForDestination) blockers.push('TAX_NOT_VERIFIED');
  if (!offer.freightVerifiedForDestination || offer.shippingCents === null) blockers.push('FREIGHT_NOT_VERIFIED');
  if (!offer.productionCapacityConfirmed) blockers.push('PRODUCTION_NOT_CONFIRMED');

  const payable = offer.shippingCents === null ? null : subtotalGrossCents + offer.shippingCents;
  if (payable !== null && !Number.isSafeInteger(payable)) {
    throw new AppError('VALIDATION', 'MERCH_PRICE_OVERFLOW', 'Importe fuera del rango admitido');
  }
  return {
    sku: offer.sku,
    lots,
    units,
    currency: offer.currency,
    subtotalNetCents,
    subtotalGrossCents,
    shippingCents: offer.shippingCents,
    payableCents: blockers.length === 0 ? payable : null,
    blockers,
  };
}

/** Solo para un contrato confirmado por servidor; no se expone al checkout público. */
export function assertMerchLotReady(offer: MerchLotOffer, lots: number): LotReview & { payableCents: number } {
  const reviewed = reviewMerchLot(offer, lots);
  if (reviewed.blockers.length > 0 || reviewed.payableCents === null) {
    throw new AppError('CONFLICT', 'MERCH_QUOTE_REQUIRED', 'El pedido requiere una cotización confirmada');
  }
  return { ...reviewed, payableCents: reviewed.payableCents };
}
