import { HttpException, HttpStatus } from '@nestjs/common';
import type { CatalogListQuery } from '@shoppilot/db/catalog-contract';
import { z } from 'zod';
import {
  catalogCategoryValues,
  catalogGenderValues,
  catalogPriceRangeValues,
  catalogSortValues,
  DEFAULT_CATALOG_PAGE,
  DEFAULT_CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_SORT,
  MAX_CATALOG_PAGE_SIZE,
  MAX_PRODUCT_DESCRIPTION_LENGTH,
  MAX_PRODUCT_MEDIA_ALT_TEXT_LENGTH,
  MAX_PRODUCT_MEDIA_OBJECT_KEY_LENGTH,
  MAX_PRODUCT_MEDIA_URL_LENGTH,
  MAX_PRODUCT_TEXT_FIELD_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MIN_CATALOG_PAGE_SIZE,
  productMediaContentTypeValues,
  productMediaRoleValues,
} from './products.types.js';

export type AdminProductMediaRole = (typeof productMediaRoleValues)[number];
export type AdminProductMediaContentType = (typeof productMediaContentTypeValues)[number];

export type AdminMediaPresignInput = {
  fileName: string;
  contentType: AdminProductMediaContentType;
  sizeBytes: number;
  role: AdminProductMediaRole;
};

export type AdminProductMediaInput = {
  objectKey: string;
  url: string;
  contentType: AdminProductMediaContentType;
  sizeBytes: number;
  altText?: string;
};

export type AdminCreateProductInput = {
  slug?: string;
  name: string;
  description: string;
  category: (typeof catalogCategoryValues)[number];
  gender: (typeof catalogGenderValues)[number];
  fit: string;
  color: string;
  priceCents: number;
  stock: number;
  available: boolean;
  media: {
    primary: AdminProductMediaInput;
    secondary?: AdminProductMediaInput;
  };
};

export type AdminUpdateProductInput = {
  name?: string;
  description?: string;
  category?: (typeof catalogCategoryValues)[number];
  gender?: (typeof catalogGenderValues)[number];
  fit?: string;
  color?: string;
  priceCents?: number;
  stock?: number;
  available?: boolean;
  media?: {
    primary?: AdminProductMediaInput;
    secondary?: AdminProductMediaInput;
  };
};

function getSingleQueryValue(value: unknown): string | undefined {
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

const queryValueSchema = z.preprocess((value) => getSingleQueryValue(value), z.string().optional());

const pageSchema = queryValueSchema.transform((value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CATALOG_PAGE;
  }

  return Math.max(DEFAULT_CATALOG_PAGE, parsed);
});

const pageSizeSchema = queryValueSchema.transform((value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CATALOG_PAGE_SIZE;
  }

  return Math.max(MIN_CATALOG_PAGE_SIZE, Math.min(MAX_CATALOG_PAGE_SIZE, parsed));
});

const sortSchema = z
  .preprocess((value) => getSingleQueryValue(value), z.enum(catalogSortValues).optional())
  .transform((value) => value ?? DEFAULT_CATALOG_SORT);

const categorySchema = z.preprocess(
  (value) => getSingleQueryValue(value),
  z.enum(catalogCategoryValues).optional(),
);

const genderSchema = z.preprocess(
  (value) => getSingleQueryValue(value),
  z.enum(catalogGenderValues).optional(),
);

const priceSchema = z.preprocess(
  (value) => getSingleQueryValue(value),
  z.enum(catalogPriceRangeValues).optional(),
);

const searchQuerySchema = z
  .preprocess((value) => getSingleQueryValue(value), z.string().trim().max(MAX_SEARCH_QUERY_LENGTH).optional())
  .transform((value) => {
    if (!value || value.length === 0) {
      return undefined;
    }

    return value;
  });

const catalogListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  sort: sortSchema,
  category: categorySchema,
  gender: genderSchema,
  price: priceSchema,
  q: searchQuerySchema,
});

const productSlugSchema = z
  .preprocess((value) => getSingleQueryValue(value), z.string().trim().min(1).max(120))
  .refine((value) => /^[a-z0-9-]+$/.test(value), {
    message: 'Product id is invalid.',
  });

const productNameSchema = z.string().trim().min(2).max(MAX_PRODUCT_TEXT_FIELD_LENGTH);
const productDescriptionSchema = z.string().trim().min(8).max(MAX_PRODUCT_DESCRIPTION_LENGTH);
const productTextSchema = z.string().trim().min(1).max(MAX_PRODUCT_TEXT_FIELD_LENGTH);
const productPriceCentsSchema = z.number().int().min(0).max(100_000_000);
const productStockSchema = z.number().int().min(0).max(1_000_000);

const productMediaPayloadSchema = z.object({
  objectKey: z.string().trim().min(3).max(MAX_PRODUCT_MEDIA_OBJECT_KEY_LENGTH),
  url: z.string().url().max(MAX_PRODUCT_MEDIA_URL_LENGTH),
  contentType: z.enum(productMediaContentTypeValues),
  sizeBytes: z.number().int().positive(),
  altText: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PRODUCT_MEDIA_ALT_TEXT_LENGTH)
    .optional(),
});

const adminMediaPresignSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(productMediaContentTypeValues),
  sizeBytes: z.number().int().positive(),
  role: z.enum(productMediaRoleValues),
});

const adminCreateProductSchema = z
  .object({
    slug: productSlugSchema.optional(),
    name: productNameSchema,
    description: productDescriptionSchema,
    category: z.enum(catalogCategoryValues),
    gender: z.enum(catalogGenderValues),
    fit: productTextSchema,
    color: productTextSchema,
    priceCents: productPriceCentsSchema,
    stock: productStockSchema,
    available: z.boolean(),
    media: z.object({
      primary: productMediaPayloadSchema,
      secondary: productMediaPayloadSchema.optional(),
    }),
  })
  .superRefine((input, context) => {
    if (input.media.secondary && input.media.primary.objectKey === input.media.secondary.objectKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', 'secondary', 'objectKey'],
        message: 'Secondary media must use a different object key.',
      });
    }
  });

const adminUpdateProductSchema = z
  .object({
    name: productNameSchema.optional(),
    description: productDescriptionSchema.optional(),
    category: z.enum(catalogCategoryValues).optional(),
    gender: z.enum(catalogGenderValues).optional(),
    fit: productTextSchema.optional(),
    color: productTextSchema.optional(),
    priceCents: productPriceCentsSchema.optional(),
    stock: productStockSchema.optional(),
    available: z.boolean().optional(),
    media: z
      .object({
        primary: productMediaPayloadSchema.optional(),
        secondary: productMediaPayloadSchema.optional(),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    const hasAnyField = Object.values(input).some((value) => value !== undefined);

    if (!hasAnyField) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'At least one product field must be provided for update.',
      });
      return;
    }

    if (
      input.media?.primary &&
      input.media?.secondary &&
      input.media.primary.objectKey === input.media.secondary.objectKey
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', 'secondary', 'objectKey'],
        message: 'Secondary media must use a different object key.',
      });
    }
  });

function formatValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, code: string): T {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code,
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseCatalogListQueryOrThrow(input: unknown): CatalogListQuery {
  const data = typeof input === 'object' && input !== null ? input : {};
  return parseOrThrow(catalogListQuerySchema, data, 'CATALOG_VALIDATION_ERROR');
}

export function parseCatalogProductIdOrThrow(input: unknown): string {
  return parseOrThrow(productSlugSchema, input, 'CATALOG_VALIDATION_ERROR');
}

export function parseAdminMediaPresignBodyOrThrow(input: unknown): AdminMediaPresignInput {
  return parseOrThrow(adminMediaPresignSchema, input, 'PRODUCT_VALIDATION_ERROR');
}

export function parseAdminCreateProductBodyOrThrow(input: unknown): AdminCreateProductInput {
  return parseOrThrow(adminCreateProductSchema, input, 'PRODUCT_VALIDATION_ERROR');
}

export function parseAdminUpdateProductBodyOrThrow(input: unknown): AdminUpdateProductInput {
  return parseOrThrow(adminUpdateProductSchema, input, 'PRODUCT_VALIDATION_ERROR');
}
