export type FilterOption = {
  label: string;
  value: string;
};

export type SectionId = 'category' | 'price' | 'sort';

export type MultiSectionConfig = {
  id: Exclude<SectionId, 'sort'>;
  label: string;
  options: FilterOption[];
  columnsClassName: string;
  optionClassName: string;
};

const CATEGORY_OPTIONS: FilterOption[] = [
  { label: 'Leggings', value: 'leggings' },
  { label: 'Tops', value: 'tops' },
  { label: 'Hoodies', value: 'hoodies' },
  { label: 'Accessories', value: 'accessories' },
];

const PRICE_OPTIONS: FilterOption[] = [
  { label: 'Under $25', value: 'under-25' },
  { label: '$25 - $50', value: '25-50' },
  { label: '$50 - $100', value: '50-100' },
  { label: '$100+', value: '100-plus' },
];

export const SORT_OPTIONS: FilterOption[] = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
];

export const DEFAULT_SORT = 'relevance';

export const MULTI_SELECT_SECTIONS: MultiSectionConfig[] = [
  {
    id: 'category',
    label: 'Category',
    options: CATEGORY_OPTIONS,
    columnsClassName: 'grid-cols-1',
    optionClassName: 'px-3 py-2 text-left text-sm',
  },
  {
    id: 'price',
    label: 'Price',
    options: PRICE_OPTIONS,
    columnsClassName: 'grid-cols-2',
    optionClassName: 'px-2 py-2 text-center text-xs',
  },
];
