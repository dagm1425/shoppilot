import type { OrderStatus } from '@shoppilot/db/order-contract';

export function formatOrderStatusLabel(status: OrderStatus): string {
  return status
    .split('_')
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function getOrderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case 'paid':
      return 'border-success/30 bg-success/10 text-success';
    case 'processing':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'shipped':
      return 'border-primary/25 bg-primary/10 text-primary';
    case 'delivered':
      return 'border-success/35 bg-success/15 text-success';
    case 'cancelled':
      return 'border-danger/35 bg-danger/10 text-danger';
    case 'refunded':
      return 'border-warning/35 bg-warning/15 text-foreground';
    case 'pending_payment':
    default:
      return 'border-warning/30 bg-warning/10 text-foreground';
  }
}
