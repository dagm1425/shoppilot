import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from '@shoppilot/db/address-contract';
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

const addressIdSchema = z.preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(120));

const optionalStringSchema = z
  .preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().trim().max(200).optional());

const requiredStringSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().min(1).max(200));

const countrySchema = z
  .preprocess((value) => {
    const parsed = getSingleValue(value);
    return parsed ? parsed.trim().toUpperCase() : parsed;
  }, z.string().length(2, 'Country must be an ISO-2 code.'))
  .refine((value) => /^[A-Z]{2}$/.test(value), {
    message: 'Country must be an ISO-2 code.',
  });

const postalCodeSchema = z
  .preprocess((value) => getSingleValue(value), z.string().trim().min(2).max(40));

const phoneSchema = z
  .preprocess((value) => {
    const parsed = getSingleValue(value);
    if (!parsed) {
      return undefined;
    }

    const trimmed = parsed.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(7).max(32).regex(/^[0-9+()\-\s]+$/, 'Phone number is invalid.').optional());

const createAddressSchema = z.object({
  recipientName: requiredStringSchema,
  country: countrySchema,
  city: requiredStringSchema,
  postalCode: postalCodeSchema,
  line1: requiredStringSchema,
  line2: optionalStringSchema,
  phone: phoneSchema,
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = createAddressSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one address field must be provided.',
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
      code: 'ADDRESS_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseAddressIdOrThrow(input: unknown): string {
  return parseOrThrow(addressIdSchema, input);
}

export function parseCreateAddressInputOrThrow(input: unknown): CreateAddressInput {
  return parseOrThrow(createAddressSchema, input);
}

export function parseUpdateAddressInputOrThrow(input: unknown): UpdateAddressInput {
  return parseOrThrow(updateAddressSchema, input);
}
