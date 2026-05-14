'use client';

import { useMemo, useState } from 'react';
import { LuChevronDown, LuSlidersHorizontal } from 'react-icons/lu';
import {
  DEFAULT_SORT,
  MULTI_SELECT_SECTIONS,
  SORT_OPTIONS,
  type MultiSectionConfig,
  type SectionId,
} from './catalog-filter-sidebar.config';
import { CatalogFilterSection } from './catalog-filter-section';
import { cn } from '../lib/utils';

type SectionState = Record<SectionId, boolean>;

export function CatalogFilterSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState<SectionState>({
    category: true,
    price: true,
    sort: true,
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [selectedSort, setSelectedSort] = useState(DEFAULT_SORT);

  const hasActiveFilters = useMemo(
    () =>
      selectedCategories.length > 0
      || selectedPrices.length > 0
      || selectedSort !== DEFAULT_SORT,
    [selectedCategories.length, selectedPrices.length, selectedSort],
  );

  function toggleSection(sectionId: SectionId) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function toggleValue(current: string[], value: string) {
    if (current.includes(value)) {
      return current.filter((entry) => entry !== value);
    }

    return [...current, value];
  }

  function clearAllFilters() {
    setSelectedCategories([]);
    setSelectedPrices([]);
    setSelectedSort(DEFAULT_SORT);
  }

  function renderMultiSelectSection(config: MultiSectionConfig) {
    const selectedValues = config.id === 'category' ? selectedCategories : selectedPrices;
    const setSelectedValues = config.id === 'category' ? setSelectedCategories : setSelectedPrices;

    return (
      <CatalogFilterSection
        key={config.id}
        title={config.label}
        open={openSections[config.id]}
        onToggle={() => toggleSection(config.id)}
      >
        <div className={cn('grid gap-2', config.columnsClassName)}>
          {config.options.map((option) => {
            const active = selectedValues.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedValues((current) => toggleValue(current, option.value))}
                className={cn(
                  'rounded-sm border transition-colors duration-200',
                  config.optionClassName,
                  active
                    ? 'border-foreground bg-muted font-medium text-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </CatalogFilterSection>
    );
  }

  return (
    <aside className="w-full md:w-72 md:shrink-0">
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="inline-flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground md:hidden"
        aria-expanded={mobileOpen}
      >
        <span className="inline-flex items-center gap-2">
          <LuSlidersHorizontal className="size-4" aria-hidden="true" />
          Filter & Sort
        </span>
        <LuChevronDown
          className={cn('size-4 transition-transform duration-200', mobileOpen ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </button>

      <div className={cn('mt-3 rounded-md border border-border bg-card p-4 md:sticky md:top-24', mobileOpen ? 'block' : 'hidden md:block')}>
        <div className="flex items-center justify-between pb-4">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Filter & Sort
          </h2>
          <button
            type="button"
            onClick={clearAllFilters}
            disabled={!hasActiveFilters}
            className={cn(
              'text-sm transition-colors duration-200',
              hasActiveFilters
                ? 'font-medium text-foreground hover:text-primary'
                : 'cursor-not-allowed text-muted-foreground',
            )}
          >
            Clear all
          </button>
        </div>
        <CatalogFilterSection
          title="Sort"
          open={openSections.sort}
          onToggle={() => toggleSection('sort')}
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">Sort products</legend>
            {SORT_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`sort-${option.value}`}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground transition-colors duration-200 hover:bg-muted"
              >
                <input
                  id={`sort-${option.value}`}
                  type="radio"
                  name="sort"
                  className="size-4 border-border text-foreground focus:ring-0"
                  checked={selectedSort === option.value}
                  onChange={() => setSelectedSort(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </CatalogFilterSection>

        {MULTI_SELECT_SECTIONS.map(renderMultiSelectSection)}
      </div>
    </aside>
  );
}
