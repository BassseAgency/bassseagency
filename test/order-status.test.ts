import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, nextOrderStatus, type OrderEvent, type OrderStatus } from '../src/modules/orders/status.js';

const completedPaid: OrderEvent = { type: 'checkout.session.completed', paymentStatus: 'paid' };
const completedUnpaid: OrderEvent = { type: 'checkout.session.completed', paymentStatus: 'unpaid' };
const completedNoPayment: OrderEvent = { type: 'checkout.session.completed', paymentStatus: 'no_payment_required' };
const expired: OrderEvent = { type: 'checkout.session.expired' };
const refunded: OrderEvent = { type: 'charge.refunded' };
const disputed: OrderEvent = { type: 'charge.dispute.created' };
const unknown: OrderEvent = { type: 'customer.created' };

const events = { completedPaid, completedUnpaid, completedNoPayment, expired, refunded, disputed, unknown };

// Tabla completa estado × evento. Todo lo no listado aquí debe dejar el estado igual.
const allowed: Partial<Record<OrderStatus, Partial<Record<keyof typeof events, OrderStatus>>>> = {
  pending_payment: { completedPaid: 'paid', expired: 'cancelled' },
  paid: { refunded: 'refunded', disputed: 'disputed' },
};

describe('nextOrderStatus', () => {
  for (const status of ORDER_STATUSES) {
    for (const [name, event] of Object.entries(events) as [keyof typeof events, OrderEvent][]) {
      const expected = allowed[status]?.[name] ?? status;
      it(`${status} + ${name} → ${expected}`, () => {
        expect(nextOrderStatus(status, event)).toBe(expected);
      });
    }
  }

  it('un expired que llega tras completed no retrocede paid', () => {
    const afterPaid = nextOrderStatus('pending_payment', completedPaid);
    expect(nextOrderStatus(afterPaid, expired)).toBe('paid');
  });

  it('completed repetido sobre paid es no-op', () => {
    expect(nextOrderStatus('paid', completedPaid)).toBe('paid');
  });

  it('refund antes de pagar no cambia el pedido', () => {
    expect(nextOrderStatus('pending_payment', refunded)).toBe('pending_payment');
  });

  it('paymentStatus ausente en completed no paga', () => {
    expect(nextOrderStatus('pending_payment', { type: 'checkout.session.completed' })).toBe('pending_payment');
  });
});
