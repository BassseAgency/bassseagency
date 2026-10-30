import type { PoolClient } from 'pg';

/**
 * Contratos entre módulos. Un módulo solo accede a datos de otro a través de estos puertos.
 * Todas las funciones reciben el client de una transacción abierta por quien llama.
 */

export interface CartLine {
  variantId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  currency: string;
  quantity: number;
}

/** Implementado por el módulo cart. */
export interface CartPort {
  /** Líneas del carrito con precio vigente. Lanza AppError NOT_FOUND (CART_NOT_FOUND) si no existe. */
  getCartLines(client: PoolClient, cartId: string): Promise<CartLine[]>;
}

export interface ReservationItem {
  variantId: string;
  quantity: number;
}

/** Implementado por el módulo inventory. */
export interface InventoryPort {
  /**
   * Reserva todas las líneas o ninguna, con orden estable de bloqueo (por variantId).
   * Idempotente por (orderId, variantId). Lanza AppError CONFLICT (OUT_OF_STOCK) si falta stock.
   */
  reserve(client: PoolClient, orderId: string, items: ReservationItem[], expiresAt: Date): Promise<void>;
  /** Convierte reservas activas en salida de stock (pago confirmado). Idempotente. */
  commit(client: PoolClient, orderId: string): Promise<void>;
  /** Libera reservas activas de un pedido (checkout caducado o cancelado). Idempotente. */
  release(client: PoolClient, orderId: string): Promise<void>;
}
