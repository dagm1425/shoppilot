import type { OrderStatus } from './order-contract.js';

export type AdminOrdersListQuery = {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  customer?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AdminOrdersListItem = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
};

export type AdminOrdersListResponse = {
  generatedAt: string;
  items: AdminOrdersListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  appliedFilters: {
    status?: OrderStatus;
    customer?: string;
    dateFrom?: string;
    dateTo?: string;
  };
};
