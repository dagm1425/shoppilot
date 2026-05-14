'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  LuHeart,
  LuMinus,
  LuPlus,
  LuRuler,
  LuShare2,
  LuTruck,
  LuZap,
} from 'react-icons/lu';
import { cn } from '../lib/utils';

type ProductVariant = {
  id: string;
  label: string;
  image: string;
};

type ProductSize = {
  label: string;
  value: string;
  disabled?: boolean;
};

type ProductAccordionSection = {
  id: 'description' | 'delivery';
  title: string;
  content: string;
};

export type ProductDetails = {
  id: string;
  name: string;
  fit: string;
  price: string;
  isNew?: boolean;
  variants: ProductVariant[];
  sizes: ProductSize[];
  accordionSections: ProductAccordionSection[];
};

type ProductDetailsPanelProps = {
  product: ProductDetails;
};

const DEFAULT_OPEN_SECTIONS: Record<ProductAccordionSection['id'], boolean> = {
  description: false,
  delivery: false,
};

export function ProductDetailsPanel({ product }: ProductDetailsPanelProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? '');
  const [selectedSize, setSelectedSize] = useState<string | null>(
    product.sizes.find((size) => size.value === 'm' && !size.disabled)?.value ?? null,
  );
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);

  const selectedVariant = useMemo(
    () => product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0],
    [product.variants, selectedVariantId],
  );

  function toggleSection(sectionId: ProductAccordionSection['id']) {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  return (
    <section className="w-full max-w-md border border-border bg-card p-5 sm:p-6">
      <header className="flex flex-col">
        {product.isNew ? (
          <span className="mb-4 inline-flex h-6 w-fit items-center rounded-sm bg-muted px-2 font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground">
            New
          </span>
        ) : null}

        <h1 className="font-auth-heading text-xl font-bold uppercase tracking-tight text-foreground sm:text-2xl">
          {product.name}
        </h1>
        <p className="mt-2 text-sm capitalize text-muted-foreground">{product.fit}</p>
        <p className="mt-2 text-sm font-bold text-foreground">US{product.price}</p>
      </header>

      <section className="flex gap-2 py-7">
        <button
          type="button"
          aria-label="Add to wishlist"
          className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors duration-200 hover:bg-muted"
        >
          <LuHeart className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Share product"
          className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors duration-200 hover:bg-muted"
        >
          <LuShare2 className="size-5" aria-hidden="true" />
        </button>
      </section>

      <section className="mb-7">
        <div className="mb-3 flex flex-wrap gap-2">
          {product.variants.map((variant) => {
            const active = selectedVariantId === variant.id;

            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedVariantId(variant.id)}
                className={cn(
                  'relative w-12 overflow-hidden border transition-colors duration-200',
                  active ? 'border-2 border-foreground' : 'border-transparent hover:border-border',
                )}
                aria-pressed={active}
                aria-label={`Select ${variant.label}`}
              >
                <span className="sr-only">{variant.label}</span>
                <img alt={variant.label} src={variant.image} className="aspect-[4/5] w-full object-cover" />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{selectedVariant?.label}</p>
      </section>

      <section className="mb-6">
        <div className="mb-4 flex items-end justify-between px-1">
          <p className="text-xs font-medium text-muted-foreground">Select a size</p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-bold text-foreground underline underline-offset-2 transition-colors duration-200 hover:text-muted-foreground"
          >
            <LuRuler className="size-3.5" aria-hidden="true" />
            Size Guide
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-sm border border-border p-4">
          {product.sizes.map((size) => {
            const active = selectedSize === size.value;

            return (
              <button
                key={size.value}
                type="button"
                disabled={size.disabled}
                onClick={() => setSelectedSize(size.value)}
                className={cn(
                  'h-12 border text-xs uppercase transition-colors duration-200',
                  active ? 'border-foreground bg-foreground font-bold text-background' : 'border-transparent text-foreground hover:border-border',
                  size.disabled ? 'cursor-not-allowed border-transparent text-muted-foreground line-through opacity-60 hover:border-transparent' : '',
                )}
                aria-pressed={active}
              >
                {size.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-7">
        <button
          type="button"
          className="w-full rounded-full bg-foreground px-5 py-4 font-auth-heading text-sm font-bold uppercase tracking-wider text-background transition-colors duration-200 hover:bg-foreground/90"
        >
          Add to bag
        </button>
      </section>

      <section className="mb-7 rounded-sm border border-border p-4">
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <LuTruck className="mt-0.5 size-4 text-foreground" aria-hidden="true" />
            <p className="text-sm leading-5 text-foreground">
              Prices and thresholds vary. Refer to our{' '}
              <Link href="#" className="underline underline-offset-2">
                delivery information
              </Link>
            </p>
          </li>
          <li className="flex items-start gap-3">
            <LuZap className="mt-0.5 size-4 text-foreground" aria-hidden="true" />
            <p className="text-sm leading-5 text-foreground">Express Delivery Available</p>
          </li>
        </ul>
      </section>

      <section className="border-t border-border">
        {product.accordionSections.map((section) => {
          const open = openSections[section.id];

          return (
            <div key={section.id} className="border-b border-border">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between py-5 text-left"
                aria-expanded={open}
              >
                <span className="font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground transition-colors duration-200 hover:text-muted-foreground">
                  {section.title}
                </span>
                {open ? (
                  <LuMinus className="size-3.5 text-foreground" aria-hidden="true" />
                ) : (
                  <LuPlus className="size-3.5 text-foreground" aria-hidden="true" />
                )}
              </button>
              {open ? <p className="pb-5 text-sm leading-6 text-muted-foreground">{section.content}</p> : null}
            </div>
          );
        })}
      </section>
    </section>
  );
}
