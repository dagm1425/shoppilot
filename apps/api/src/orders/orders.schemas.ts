import { HttpException, HttpStatus } from '@nestjs/common';
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
