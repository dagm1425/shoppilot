import { ProductCategory } from '@prisma/client';
import {
  fromPrismaCategory,
  fromPrismaGender,
  mapCatalogPriceRangeToWhere,
  mapCatalogSortToOrderBy,
  normalizeCatalogSearchQuery,
  toPrismaCategory,
  toPrismaGender,
} from '../../src/products/products.query-utils.js';
import { ProductGender } from '@prisma/client';

describe('catalog query utils', () => {
  it('normalizes query text', () => {
    expect(normalizeCatalogSearchQuery('  shoes  ')).toBe('shoes');
    expect(normalizeCatalogSearchQuery('   ')).toBeUndefined();
    expect(normalizeCatalogSearchQuery(undefined)).toBeUndefined();
  });

  it('maps categories to and from prisma enum values', () => {
    expect(toPrismaCategory('tops')).toBe(ProductCategory.TOPS);
    expect(toPrismaCategory('bottoms')).toBe(ProductCategory.BOTTOMS);
    expect(fromPrismaCategory(ProductCategory.BOTTOMS)).toBe('bottoms');
    expect(toPrismaGender('men')).toBe(ProductGender.MEN);
    expect(fromPrismaGender(ProductGender.WOMEN)).toBe('women');
  });

  it('maps stable sort values to expected prisma ordering', () => {
    expect(mapCatalogSortToOrderBy('newest', false)).toEqual([{ createdAt: 'desc' }]);
    expect(mapCatalogSortToOrderBy('price-asc', false)).toEqual([
      { priceCents: 'asc' },
      { createdAt: 'desc' },
    ]);
    expect(mapCatalogSortToOrderBy('relevance', true)).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
    ]);
  });

  it('maps price ranges to prisma where clauses', () => {
    expect(mapCatalogPriceRangeToWhere('under-25')).toEqual({
      priceCents: {
        lt: 2500,
      },
    });
    expect(mapCatalogPriceRangeToWhere('25-40')).toEqual({
      priceCents: {
        gte: 2500,
        lte: 4000,
      },
    });
    expect(mapCatalogPriceRangeToWhere('over-40')).toEqual({
      priceCents: {
        gt: 4000,
      },
    });
    expect(mapCatalogPriceRangeToWhere(undefined)).toBeUndefined();
  });
});
