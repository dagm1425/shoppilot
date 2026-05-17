import type { OrderStatus } from './order-contract.js';

export type AdminKpiSummary = {
  ordersToday: number;
  grossRevenueTodayCents: number;
  paidOrdersToday: number;
  pendingPaymentOrders: number;
};

export type AdminRevenueTrendPoint = {
  date: string;
  totalCents: number;
};

export type AdminRecentOrderPreview = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
};

export type AdminHomeSummaryResponse = {
  generatedAt: string;
  currency: string;
  kpis: AdminKpiSummary;
  revenueTrendLast30Days: AdminRevenueTrendPoint[];
  recentOrders: AdminRecentOrderPreview[];
};
