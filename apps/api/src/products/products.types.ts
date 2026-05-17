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

export const productMediaRoleValues = ['primary', 'secondary'] as const;
export const productMediaContentTypeValues = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PRODUCT_MEDIA_OBJECT_KEY_LENGTH = 320;
export const MAX_PRODUCT_MEDIA_URL_LENGTH = 2_048;
export const MAX_PRODUCT_MEDIA_ALT_TEXT_LENGTH = 180;
export const MAX_PRODUCT_TEXT_FIELD_LENGTH = 160;
export const MAX_PRODUCT_DESCRIPTION_LENGTH = 2_000;
