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
 *
 * Pago confirmado: `checkout.session.completed` con `paid` (tarjeta, síncrono) o
 * `checkout.session.async_payment_succeeded` (métodos diferidos, p. ej. transferencia).
 * Un método diferido llega primero como `completed` con `unpaid`: no paga todavía.
 */
export function nextOrderStatus(current: OrderStatus, event: OrderEvent): OrderStatus {
  switch (current) {
    case 'pending_payment':
      if (isPaymentConfirmed(event)) return 'paid';
      if (event.type === 'checkout.session.expired') return 'cancelled';
      // Una sesión ya completed no caduca: el fallo del pago diferido es la única señal de cierre.
      if (event.type === 'checkout.session.async_payment_failed') return 'cancelled';
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

/** Checkout completado con un método diferido (transferencia): el dinero aún no ha llegado. */
export function isAwaitingDelayedPayment(event: OrderEvent): boolean {
  return event.type === 'checkout.session.completed' && event.paymentStatus === 'unpaid';
}

export function isPaymentConfirmed(event: OrderEvent): boolean {
  if (event.paymentStatus !== 'paid') return false;
  return event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
}
