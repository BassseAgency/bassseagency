/** Estados de pedido (ver CHECK en migrations/0002). */
export const ORDER_STATUSES = ['pending_payment', 'paid', 'cancelled', 'refunded', 'disputed'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderEvent {
  type: string;
  paymentStatus?: string | null;
}

/**
 * Transición monotónica (ADR 0001 §9). Un evento que no aplica al estado actual
 * (antiguo, repetido o desconocido) deja el estado como está.
 */
export function nextOrderStatus(current: OrderStatus, event: OrderEvent): OrderStatus {
  switch (current) {
    case 'pending_payment':
      if (event.type === 'checkout.session.completed' && event.paymentStatus === 'paid') return 'paid';
      if (event.type === 'checkout.session.expired') return 'cancelled';
      return current;
    case 'paid':
      if (event.type === 'charge.refunded') return 'refunded';
      if (event.type === 'charge.dispute.created') return 'disputed';
      return current;
    case 'cancelled':
    case 'refunded':
    case 'disputed':
      return current;
  }
}
