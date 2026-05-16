import type { CatalogCategory, CatalogGender, CatalogPriceRange, CatalogSort } from '@shoppilot/db/catalog-contract';

export const catalogSortValues = [
  'relevance',
  'newest',
  'price-asc',
  'price-desc',
] as const satisfies readonly CatalogSort[];

export const catalogCategoryValues = [
  'bottoms',
  'tops',
] as const satisfies readonly CatalogCategory[];

export const catalogGenderValues = [
  'men',
  'women',
] as const satisfies readonly CatalogGender[];

export const catalogPriceRangeValues = [
  'under-25',
  '25-40',
  'over-40',
] as const satisfies readonly CatalogPriceRange[];

export const DEFAULT_CATALOG_SORT: CatalogSort = 'relevance';
export const DEFAULT_CATALOG_PAGE = 1;
export const DEFAULT_CATALOG_PAGE_SIZE = 12;
export const MIN_CATALOG_PAGE_SIZE = 1;
export const MAX_CATALOG_PAGE_SIZE = 36;
export const MAX_SEARCH_QUERY_LENGTH = 120;
