import type { CatalogCategory, CatalogGender, CatalogPriceRange, CatalogSort } from '@shoppilot/db/catalog-contract';
import { ProductCategory, ProductGender, type Prisma } from '@prisma/client';

const CATEGORY_TO_PRISMA: Record<CatalogCategory, ProductCategory> = {
  bottoms: ProductCategory.BOTTOMS,
  tops: ProductCategory.TOPS,
};

const GENDER_TO_PRISMA: Record<CatalogGender, ProductGender> = {
  men: ProductGender.MEN,
  women: ProductGender.WOMEN,
};

export function toPrismaCategory(category: CatalogCategory): ProductCategory {
  return CATEGORY_TO_PRISMA[category];
}

export function fromPrismaCategory(category: ProductCategory): CatalogCategory {
  if (category === ProductCategory.BOTTOMS) {
    return 'bottoms';
  }

  return 'tops';
}

export function toPrismaGender(gender: CatalogGender): ProductGender {
  return GENDER_TO_PRISMA[gender];
}

export function fromPrismaGender(gender: ProductGender): CatalogGender {
  if (gender === ProductGender.WOMEN) {
    return 'women';
  }

  return 'men';
}

export function normalizeCatalogSearchQuery(q?: string): string | undefined {
  if (!q) {
    return undefined;
  }

  const trimmed = q.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

export function mapCatalogSortToOrderBy(
  sort: CatalogSort,
  hasSearchQuery: boolean,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'price-asc':
      return [{ priceCents: 'asc' }, { createdAt: 'desc' }];
    case 'price-desc':
      return [{ priceCents: 'desc' }, { createdAt: 'desc' }];
    case 'relevance':
    default:
      if (hasSearchQuery) {
        // future: relevance ranking - upgrade naive text search ordering when dedicated ranking strategy is introduced
        return [{ name: 'asc' }, { createdAt: 'desc' }];
      }

      return [{ createdAt: 'desc' }];
  }
}

export function mapCatalogPriceRangeToWhere(
  priceRange?: CatalogPriceRange,
): Prisma.ProductWhereInput | undefined {
  if (!priceRange) {
    return undefined;
  }

  if (priceRange === 'under-25') {
    return {
      priceCents: {
        lt: 2500,
      },
    };
  }

  if (priceRange === '25-40') {
    return {
      priceCents: {
        gte: 2500,
        lte: 4000,
      },
    };
  }

  return {
    priceCents: {
      gt: 4000,
    },
  };
}
