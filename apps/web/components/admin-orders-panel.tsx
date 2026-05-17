'use client';

import type { AdminOrdersListQuery, AdminOrdersListResponse } from '@shoppilot/db/admin-orders-contract';
import type { OrderStatus } from '@shoppilot/db/order-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../lib/auth-store';
import { fetchAdminOrdersList, getAdminOrdersErrorMessage } from '../lib/admin-api';
import { reportClientError } from '../lib/client-error';
import { formatOrderStatusLabel, getOrderStatusBadgeClass } from '../lib/order-status';
import { StatePanel } from './state-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type LoadState = 'loading' | 'success' | 'error';

type OrderFilterDraft = {
  status: 'all' | OrderStatus;
  customer: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_PAGE_SIZE = 10;
const initialQuery: AdminOrdersListQuery = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const statusOptions: Array<{ value: 'all' | OrderStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildFilterDraft(query: AdminOrdersListQuery): OrderFilterDraft {
  return {
    status: query.status ?? 'all',
    customer: query.customer ?? '',
    dateFrom: query.dateFrom ?? '',
    dateTo: query.dateTo ?? '',
  };
}

function buildQueryFromDraft(draft: OrderFilterDraft): AdminOrdersListQuery {
  const customer = draft.customer.trim();

  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    status: draft.status === 'all' ? undefined : draft.status,
    customer: customer.length > 0 ? customer : undefined,
    dateFrom: draft.dateFrom || undefined,
    dateTo: draft.dateTo || undefined,
  };
}

function FiltersSummary({ result }: { result: AdminOrdersListResponse }) {
  const { appliedFilters } = result;
  const chips: string[] = [];

  if (appliedFilters.status) {
    chips.push(`Status: ${formatOrderStatusLabel(appliedFilters.status)}`);
  }

  if (appliedFilters.customer) {
    chips.push(`Customer: ${appliedFilters.customer}`);
  }

  if (appliedFilters.dateFrom || appliedFilters.dateTo) {
    chips.push(`Date: ${appliedFilters.dateFrom ?? '...'} to ${appliedFilters.dateTo ?? '...'}`);
  }

  if (chips.length === 0) {
    return <p className="text-xs text-muted-foreground">No filters applied.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

export function AdminOrdersPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);

  const [status, setStatus] = useState<LoadState>('loading');
  const [query, setQuery] = useState<AdminOrdersListQuery>(initialQuery);
  const [draft, setDraft] = useState<OrderFilterDraft>(buildFilterDraft(initialQuery));
  const [result, setResult] = useState<AdminOrdersListResponse | null>(null);
  const [message, setMessage] = useState('Loading admin orders...');
  const [refreshing, setRefreshing] = useState(false);

  const runQuery = useCallback(
    async (nextQuery: AdminOrdersListQuery, mode: 'initial' | 'soft') => {
      if (mode === 'initial') {
        setStatus('loading');
        setMessage('Loading admin orders...');
      } else {
        setRefreshing(true);
      }

      try {
        const response = await fetchAdminOrdersList(nextQuery);

        if (!response.ok) {
          if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
            clearUser();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setStatus('error');
          setMessage(getAdminOrdersErrorMessage(response.message, response.code));
          return;
        }

        setQuery(nextQuery);
        setResult(response.data);
        setStatus('success');
      } catch (error) {
        reportClientError({ error, context: mode === 'initial' ? 'admin-orders:load' : 'admin-orders:query' });
        setStatus('error');
        setMessage(mode === 'initial' ? 'Could not load admin orders.' : 'Could not refresh admin orders.');
      } finally {
        if (mode === 'soft') {
          setRefreshing(false);
        }
      }
    },
    [clearUser, pathname, router],
  );

  useEffect(() => {
    void runQuery(initialQuery, 'initial');
  }, [runQuery]);

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuery(buildQueryFromDraft(draft), 'soft');
  }

  async function handleClearFilters() {
    const nextDraft = buildFilterDraft(initialQuery);
    setDraft(nextDraft);
    await runQuery(initialQuery, 'soft');
  }

  async function handleRefresh() {
    await runQuery(query, 'soft');
  }

  async function handleChangePage(nextPage: number) {
    if (!result) {
      return;
    }

    if (nextPage < 1 || (result.pagination.totalPages > 0 && nextPage > result.pagination.totalPages)) {
      return;
    }

    await runQuery(
      {
        ...query,
        page: nextPage,
      },
      'soft',
    );
  }

  if (status === 'loading') {
    return (
      <StatePanel
        variant="loading"
        title="Loading orders list"
        description="Fetching admin orders, filters, and pagination state."
      />
    );
  }

  if (status === 'error' || !result) {
    return (
      <StatePanel variant="error" title="Orders list unavailable" description={message}>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? 'Retrying...' : 'Retry'}
        </button>
      </StatePanel>
    );
  }

  const hasPrevious = result.pagination.page > 1;
  const hasNext = result.pagination.page < result.pagination.totalPages;

  return (
    <section className="space-y-4">
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Orders</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Admin orders list</h2>
            <p className="mt-1 text-sm text-muted-foreground">Last updated {formatDateTime(result.generatedAt)}</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      <Card className="border-border/90 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold text-foreground">Filters</CardTitle>
          <CardDescription>Filter by status, customer email, and created date window.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-1">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleApplyFilters}>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Status
              <select
                value={draft.status}
                onChange={(event) => {
                  const value = event.target.value as OrderFilterDraft['status'];
                  setDraft((current) => ({ ...current, status: value }));
                }}
                className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Customer
              <input
                type="text"
                value={draft.customer}
                onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))}
                placeholder="Email contains..."
                className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground"
              />
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Date from
              <input
                type="date"
                value={draft.dateFrom}
                onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))}
                className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground"
              />
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Date to
              <input
                type="date"
                value={draft.dateTo}
                onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))}
                className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground"
              />
            </label>

            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={refreshing}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? 'Applying...' : 'Apply filters'}
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={refreshing}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </form>

          <FiltersSummary result={result} />
        </CardContent>
      </Card>

      <Card className="border-border/90 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold text-foreground">Orders</CardTitle>
          <CardDescription>
            Showing {result.items.length.toLocaleString('en-US')} of {result.pagination.total.toLocaleString('en-US')} orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-1">
          {result.items.length === 0 ? (
            <StatePanel
              variant="empty"
              title="No orders found"
              description="Try widening the filter criteria or clearing filters."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th scope="col" className="px-3 py-2">
                      Order
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Customer
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((order) => (
                    <tr key={order.orderId} className="align-top">
                      <td className="px-3 py-3 font-medium text-foreground">{order.orderNumber}</td>
                      <td className="px-3 py-3 text-muted-foreground">{order.customerEmail}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getOrderStatusBadgeClass(order.status)}`}
                        >
                          {formatOrderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-foreground">{formatMoney(order.totalCents, order.currency)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Page {result.pagination.page} of {Math.max(result.pagination.totalPages, 1)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleChangePage(result.pagination.page - 1);
                }}
                disabled={!hasPrevious || refreshing}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleChangePage(result.pagination.page + 1);
                }}
                disabled={!hasNext || refreshing}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
