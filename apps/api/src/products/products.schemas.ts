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
  MAX_SEARCH_QUERY_LENGTH,
  MIN_CATALOG_PAGE_SIZE,
} from './products.types.js';

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

const catalogProductIdSchema = z
  .preprocess((value) => getSingleQueryValue(value), z.string().trim().min(1).max(120))
  .refine((value) => /^[a-z0-9-]+$/.test(value), {
    message: 'Product id is invalid.',
  });

function formatValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}

export function parseCatalogListQueryOrThrow(input: unknown): CatalogListQuery {
  const data = typeof input === 'object' && input !== null ? input : {};
  const parsed = catalogListQuerySchema.safeParse(data);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'CATALOG_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function parseCatalogProductIdOrThrow(input: unknown): string {
  const parsed = catalogProductIdSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'CATALOG_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}
