'use client';

import type { CatalogGender, CatalogPriceRange, CatalogSort } from '@shoppilot/db/catalog-contract';
import { useState } from 'react';
import { LuChevronDown } from 'react-icons/lu';
import { CATALOG_GENDER_OPTIONS, CATALOG_PRICE_OPTIONS, CATALOG_SORT_OPTIONS } from '../../lib/catalog-api';
import { cn } from '../../lib/utils';

const PRICE_RANGE_OPTIONS = [
  { label: 'All prices', value: 'all' },
  ...CATALOG_PRICE_OPTIONS,
] as const;

type FilterGroupKey = 'sort' | 'gender' | 'price';
export type CatalogPriceRangeFilter = CatalogPriceRange | 'all';

type CatalogFilterSidebarProps = {
  sort: CatalogSort;
  selectedGender: CatalogGender | 'all';
  selectedPriceRange: CatalogPriceRangeFilter;
  hasActiveFilters: boolean;
  onSortChange: (sort: CatalogSort) => void;
  onGenderChange: (gender: CatalogGender | undefined) => void;
  onPriceRangeChange: (range: CatalogPriceRangeFilter) => void;
  onClearAll: () => void;
};

export function CatalogFilterSidebar({
  sort,
  selectedGender,
  selectedPriceRange,
  hasActiveFilters,
  onSortChange,
  onGenderChange,
  onPriceRangeChange,
  onClearAll,
}: CatalogFilterSidebarProps) {
  const [openFilterGroup, setOpenFilterGroup] = useState<FilterGroupKey | null>('sort');

  function toggleFilterGroup(group: FilterGroupKey) {
    setOpenFilterGroup((activeGroup) => (activeGroup === group ? null : group));
  }

  return (
    <aside className="lg:sticky lg:top-[90px] lg:self-start lg:pr-2">
      <div className="flex items-center justify-between pb-6">
        <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wide text-foreground">
          Filter & Sort
        </h2>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/60"
        >
          Clear All
        </button>
      </div>

      <div>
        <button
          type="button"
          onClick={() => toggleFilterGroup('sort')}
          className="relative flex w-full items-start justify-between py-6 before:absolute before:left-0 before:right-0 before:top-0 before:border-t before:border-border"
          aria-expanded={openFilterGroup === 'sort'}
        >
          <h3 className="font-auth-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Sort By
          </h3>
          <LuChevronDown
            className={cn(
              'mt-0.5 size-4 text-muted-foreground transition-transform',
              openFilterGroup === 'sort' ? 'rotate-180' : '',
            )}
            aria-hidden="true"
          />
        </button>

        {openFilterGroup === 'sort' ? (
          <div className="mb-6">
            {CATALOG_SORT_OPTIONS.map((option) => {
              const active = sort === option.value;

              return (
                <label
                  key={option.value}
                  className="relative flex h-9 cursor-pointer items-center pl-8 text-sm leading-[21px] text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="catalog-sort-sidebar"
                    checked={active}
                    onChange={() => onSortChange(option.value)}
                    className="sr-only"
                  />
                  <span className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-border" />
                  <span
                    className={cn(
                      'absolute left-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
                      active ? 'bg-foreground' : 'bg-transparent',
                    )}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => toggleFilterGroup('gender')}
          className="relative flex w-full items-start justify-between py-6 before:absolute before:left-0 before:right-0 before:top-0 before:border-t before:border-border"
          aria-expanded={openFilterGroup === 'gender'}
        >
          <h3 className="font-auth-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Gender
          </h3>
          <LuChevronDown
            className={cn(
              'mt-0.5 size-4 text-muted-foreground transition-transform',
              openFilterGroup === 'gender' ? 'rotate-180' : '',
            )}
            aria-hidden="true"
          />
        </button>

        {openFilterGroup === 'gender' ? (
          <div className="mb-6">
            {[
              { label: 'All genders', value: 'all' as const },
              ...CATALOG_GENDER_OPTIONS,
            ].map((option) => {
              const active = selectedGender === option.value;

              return (
                <label
                  key={option.value}
                  className="relative flex h-9 cursor-pointer items-center pl-8 text-sm leading-[21px] text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="catalog-gender-sidebar"
                    checked={active}
                    onChange={() => onGenderChange(option.value === 'all' ? undefined : option.value)}
                    className="sr-only"
                  />
                  <span className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-border" />
                  <span
                    className={cn(
                      'absolute left-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
                      active ? 'bg-foreground' : 'bg-transparent',
                    )}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => toggleFilterGroup('price')}
          className="relative flex w-full items-start justify-between py-6 before:absolute before:left-0 before:right-0 before:top-0 before:border-t before:border-border"
          aria-expanded={openFilterGroup === 'price'}
        >
          <h3 className="font-auth-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Price
          </h3>
          <LuChevronDown
            className={cn(
              'mt-0.5 size-4 text-muted-foreground transition-transform',
              openFilterGroup === 'price' ? 'rotate-180' : '',
            )}
            aria-hidden="true"
          />
        </button>

        {openFilterGroup === 'price' ? (
          <div className="mb-6">
            {PRICE_RANGE_OPTIONS.map((option) => {
              const active = selectedPriceRange === option.value;

              return (
                <label
                  key={option.value}
                  className="relative flex h-9 cursor-pointer items-center pl-8 text-sm leading-[21px] text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="catalog-price-sidebar"
                    checked={active}
                    onChange={() => onPriceRangeChange(option.value)}
                    className="sr-only"
                  />
                  <span className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-border" />
                  <span
                    className={cn(
                      'absolute left-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
                      active ? 'bg-foreground' : 'bg-transparent',
                    )}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
