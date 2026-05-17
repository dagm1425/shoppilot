import { HttpException, HttpStatus } from '@nestjs/common';
import type { AdminOrdersListQuery } from '@shoppilot/db/admin-orders-contract';
import { z } from 'zod';

function getSingleValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const firstString = value.find((entry) => typeof entry === 'string');
    if (typeof firstString === 'string') {
      return firstString;
    }
  }

  return undefined;
}

const orderNumberSchema = z.preprocess(
  (value) => getSingleValue(value)?.trim().toUpperCase(),
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^SP-\d{8}-[A-Z0-9]{6}$/, 'Order number is invalid.'),
);

const adminOrderStatusValues = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

const DEFAULT_ORDERS_PAGE = 1;
const DEFAULT_ORDERS_PAGE_SIZE = 10;
const MAX_ORDERS_PAGE_SIZE = 50;

const adminOrderQueryValueSchema = z.preprocess((value) => getSingleValue(value), z.string().optional());

const adminOrdersPageSchema = adminOrderQueryValueSchema.transform((value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ORDERS_PAGE;
  }

  return Math.max(DEFAULT_ORDERS_PAGE, parsed);
});

const adminOrdersPageSizeSchema = adminOrderQueryValueSchema.transform((value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ORDERS_PAGE_SIZE;
  }

  return Math.max(1, Math.min(MAX_ORDERS_PAGE_SIZE, parsed));
});

const adminOrderStatusSchema = z.preprocess(
  (value) => getSingleValue(value),
  z.enum(adminOrderStatusValues).optional(),
);

const adminOrderCustomerSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().max(120).optional())
  .transform((value) => {
    if (!value || value.length === 0) {
      return undefined;
    }

    return value;
  });

const adminOrderDateSchema = z.preprocess(
  (value) => getSingleValue(value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date filters must use YYYY-MM-DD format.')
    .refine((value) => Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)), {
      message: 'Date filters must be valid calendar dates.',
    })
    .optional(),
);

const adminOrdersListQuerySchema = z
  .object({
    page: adminOrdersPageSchema,
    pageSize: adminOrdersPageSizeSchema,
    status: adminOrderStatusSchema,
    customer: adminOrderCustomerSchema,
    dateFrom: adminOrderDateSchema,
    dateTo: adminOrderDateSchema,
  })
  .superRefine((value, context) => {
    if (!value.dateFrom || !value.dateTo) {
      return;
    }

    if (value.dateFrom > value.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFrom must be on or before dateTo.',
        path: ['dateFrom'],
      });
    }
  });

function formatValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'ORDER_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseOrderNumberOrThrow(input: unknown): string {
  return parseOrThrow(orderNumberSchema, input);
}

export function parseAdminOrdersListQueryOrThrow(input: unknown): AdminOrdersListQuery {
  const data = typeof input === 'object' && input !== null ? input : {};
  return parseOrThrow(adminOrdersListQuerySchema, data);
}
