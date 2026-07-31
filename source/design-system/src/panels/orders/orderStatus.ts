import type { OrderStatus } from '../../data/types';

/** Token color for an order status — shared by the blotter badge + detail pane. */
export function orderStatusColor(status: OrderStatus): string {
  switch (status) {
    case 'filled': return 'var(--ds-accent-positive)';
    case 'partial': return 'var(--ds-accent-warning)';
    case 'pending': return 'var(--ds-accent-info)';
    case 'cancelled': return 'var(--ds-accent-negative)';
  }
}
