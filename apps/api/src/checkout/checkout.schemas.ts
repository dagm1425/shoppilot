import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  SelectCheckoutAddressInput,
  UpdateCheckoutContactInput,
} from '@shoppilot/db/checkout-contract';
import type { PlaceOrderInput } from '@shoppilot/db/order-contract';
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

const sessionTokenSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(200));

const selectAddressSchema = z.object({
  addressId: z.preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120)),
});

const updateContactSchema = z.object({
  email: z.preprocess((value) => getSingleValue(value), z.string().trim().email().max(200)),
  phone: z.preprocess(
    (value) => getSingleValue(value),
    z
      .string()
      .trim()
      .min(7)
      .max(32)
      .regex(/^[0-9+()\-\s]+$/, 'Phone number is invalid.'),
  ),
});

const placeOrderSchema = z.object({
  checkoutSessionToken: z.preprocess(
    (value) => getSingleValue(value),
    z.string().trim().min(1).max(200),
  ),
  idempotencyKey: z.preprocess(
    (value) => getSingleValue(value),
    z
      .string()
      .trim()
      .min(8)
      .max(255)
      .regex(/^[a-zA-Z0-9:_-]+$/, 'Idempotency key is invalid.'),
  ),
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
      code: 'CHECKOUT_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseCheckoutSessionTokenOrThrow(input: unknown): string {
  return parseOrThrow(sessionTokenSchema, input);
}

export function parseSelectCheckoutAddressInputOrThrow(input: unknown): SelectCheckoutAddressInput {
  return parseOrThrow(selectAddressSchema, input);
}

export function parseUpdateCheckoutContactInputOrThrow(input: unknown): UpdateCheckoutContactInput {
  return parseOrThrow(updateContactSchema, input);
}

export function parseCheckoutProviderSessionIdOrThrow(input: unknown): string {
  return parseOrThrow(
    z.preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(255)),
    input,
  );
}

export function parsePlaceOrderInputOrThrow(input: unknown): PlaceOrderInput {
  return parseOrThrow(placeOrderSchema, input);
}
