'use client';

import type { AdminHomeSummaryResponse, AdminRecentOrderPreview } from '@shoppilot/db/admin-dashboard-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '../lib/auth-store';
import { fetchAdminHomeSummary, getAdminHomeErrorMessage } from '../lib/admin-api';
import { reportClientError } from '../lib/client-error';
import { formatOrderStatusLabel, getOrderStatusBadgeClass } from '../lib/order-status';
import { StatePanel } from './state-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart';

type LoadState = 'loading' | 'success' | 'error';

const revenueChartConfig = {
  totalCents: {
    label: 'Revenue',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatMoneyCompact(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
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

function formatChartDay(value: string): string {
  const day = new Date(`${value}T00:00:00Z`);
  return day.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

type KpiCardProps = {
  label: string;
  value: string;
  description: string;
};

function KpiCard({ label, value, description }: KpiCardProps) {
  return (
    <Card className="border-border/90 shadow-none">
      <CardHeader className="space-y-2 p-4 pb-2">
        <CardDescription className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold text-foreground">{value}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

type RecentOrdersTableProps = {
  orders: AdminRecentOrderPreview[];
};

function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  if (orders.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="No recent orders"
        description="Recent orders will appear here once checkout activity starts."
      />
    );
  }

  return (
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
              Total
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
            <th scope="col" className="px-3 py-2">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.orderId} className="align-top">
              <td className="px-3 py-3 font-medium text-foreground">{order.orderNumber}</td>
              <td className="px-3 py-3 text-muted-foreground">{order.customerEmail}</td>
              <td className="px-3 py-3 text-foreground">{formatMoney(order.totalCents, order.currency)}</td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getOrderStatusBadgeClass(order.status)}`}
                >
                  {formatOrderStatusLabel(order.status)}
                </span>
              </td>
              <td className="px-3 py-3 text-muted-foreground">{formatDateTime(order.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);

  const [status, setStatus] = useState<LoadState>('loading');
  const [summary, setSummary] = useState<AdminHomeSummaryResponse | null>(null);
  const [message, setMessage] = useState('Loading admin dashboard data...');
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(
    async (source: 'initial' | 'refresh') => {
      if (source === 'initial') {
        setStatus('loading');
        setMessage('Loading admin dashboard data...');
      }

      try {
        const response = await fetchAdminHomeSummary();

        if (!response.ok) {
          if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
            clearUser();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setStatus('error');
          setMessage(getAdminHomeErrorMessage(response.message, response.code));
          return;
        }

        setSummary(response.data);
        setStatus('success');
      } catch (error) {
        reportClientError({ error, context: source === 'initial' ? 'admin-home:load' : 'admin-home:refresh' });
        setStatus('error');
        setMessage(source === 'initial' ? 'Could not load admin dashboard data.' : 'Could not refresh dashboard data.');
      }
    },
    [clearUser, pathname, router],
  );

  useEffect(() => {
    void loadSummary('initial');
  }, [loadSummary]);

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await loadSummary('refresh');
    } finally {
      setRefreshing(false);
    }
  }

  const chartData = useMemo(
    () =>
      summary?.revenueTrendLast30Days.map((point) => ({
        ...point,
        displayDate: formatChartDay(point.date),
      })) ?? [],
    [summary],
  );

  if (status === 'loading') {
    return (
      <StatePanel
        variant="loading"
        title="Loading admin home"
        description="Fetching KPI cards, chart data, and recent orders."
      />
    );
  }

  if (status === 'error' || !summary) {
    return (
      <StatePanel variant="error" title="Admin home unavailable" description={message}>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? 'Refreshing...' : 'Refresh dashboard'}
        </button>
      </StatePanel>
    );
  }

  return (
    <section className="space-y-4">
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Admin home</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Operations snapshot</h2>
            <p className="mt-1 text-sm text-muted-foreground">Last updated {formatDateTime(summary.generatedAt)}</p>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Orders today"
          value={summary.kpis.ordersToday.toLocaleString('en-US')}
          description="Orders created since local midnight."
        />
        <KpiCard
          label="Gross revenue today"
          value={formatMoney(summary.kpis.grossRevenueTodayCents, summary.currency)}
          description="Paid-order total booked today."
        />
        <KpiCard
          label="Paid orders today"
          value={summary.kpis.paidOrdersToday.toLocaleString('en-US')}
          description="Orders with payment confirmed today."
        />
        <KpiCard
          label="Pending payment"
          value={summary.kpis.pendingPaymentOrders.toLocaleString('en-US')}
          description="Current orders awaiting payment completion."
        />
      </section>

      <Card className="border-border/90 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold text-foreground">
            Revenue trend (last 30 days)
          </CardTitle>
          <CardDescription>Daily paid-order revenue with zero-filled dates.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <ChartContainer config={revenueChartConfig} className="h-[260px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 8,
                right: 8,
                top: 12,
                bottom: 4,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="displayDate" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={84}
                tickFormatter={(value) => formatMoneyCompact(Number(value), summary.currency)}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload;

                      if (!row || typeof row.date !== 'string') {
                        return null;
                      }

                      return formatChartDay(row.date);
                    }}
                    formatter={(value) => {
                      if (typeof value !== 'number') {
                        return null;
                      }

                      return (
                        <div className="flex min-w-[140px] items-center justify-between gap-4">
                          <span className="text-muted-foreground">Revenue</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(value, summary.currency)}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="totalCents"
                stroke="var(--color-totalCents)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/90 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold text-foreground">Recent orders</CardTitle>
          <CardDescription>Latest {summary.recentOrders.length} orders for quick review.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <RecentOrdersTable orders={summary.recentOrders} />
        </CardContent>
      </Card>

      <section className="rounded-lg border border-dashed bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Internal observability note</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Detailed operational logs are monitored in CloudWatch and exception tracking is handled in Sentry
          (internal access only).
        </p>
      </section>
    </section>
  );
}
