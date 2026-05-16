import { HttpException, HttpStatus } from '@nestjs/common';
import type { AddCartItemInput, UpdateCartItemInput } from '@shoppilot/db/cart-contract';
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

const quantitySchema = z
  .preprocess((value) => {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      return Number.parseInt(value, 10);
    }

    return value;
  }, z.number().int().min(1, 'Quantity must be at least 1.').max(999, 'Quantity is too large.'));

const productIdSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120))
  .refine((value) => /^[a-z0-9-]+$/.test(value), {
    message: 'Product id is invalid.',
  });

const cartItemIdSchema = z.preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120));
const sizeSchema = z.preprocess(
  (value) => getSingleValue(value),
  z.enum(['s', 'm', 'l', 'xl']),
);

const addCartItemSchema = z.object({
  productId: productIdSchema,
  size: sizeSchema,
  quantity: quantitySchema.default(1),
});

const updateCartItemSchema = z.object({
  quantity: quantitySchema,
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
      code: 'CART_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseAddCartItemOrThrow(input: unknown): AddCartItemInput {
  return parseOrThrow(addCartItemSchema, input);
}

export function parseUpdateCartItemOrThrow(input: unknown): UpdateCartItemInput {
  return parseOrThrow(updateCartItemSchema, input);
}

export function parseCartItemIdOrThrow(input: unknown): string {
  return parseOrThrow(cartItemIdSchema, input);
}
