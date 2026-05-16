import { HttpException, HttpStatus } from '@nestjs/common';
import type { AddWishlistItemInput } from '@shoppilot/db/wishlist-contract';
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

const productIdSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120))
  .refine((value) => /^[a-z0-9-]+$/.test(value), {
    message: 'Product id is invalid.',
  });

const wishlistItemIdSchema = z.preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120));

const addWishlistItemSchema = z.object({
  productId: productIdSchema,
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
      code: 'WISHLIST_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseAddWishlistItemOrThrow(input: unknown): AddWishlistItemInput {
  return parseOrThrow(addWishlistItemSchema, input);
}

export function parseWishlistItemIdOrThrow(input: unknown): string {
  return parseOrThrow(wishlistItemIdSchema, input);
}
