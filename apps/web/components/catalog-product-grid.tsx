'use client';

import Link from 'next/link';
import { FaStar } from 'react-icons/fa6';
import { LuHeart } from 'react-icons/lu';
import { CATALOG_PLACEHOLDER_PRODUCTS, type CatalogProduct } from './catalog-products.data';

type ProductCardProps = {
  product: CatalogProduct;
};

function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="relative flex min-w-0 flex-col font-auth-body text-left">
      <div className="relative">
        <Link href={product.href} aria-label={product.name} className="group block">
          <div className="relative aspect-[4/5] overflow-hidden bg-border">
            <img
              alt={`${product.name} front`}
              src={product.primaryImage}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <img
              alt={`${product.name} detail`}
              src={product.secondaryImage}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
            {product.isNew ? (
              <span className="absolute bottom-2 left-2 rounded-sm bg-card px-2 py-1 font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground">
                New
              </span>
            ) : null}
          </div>
        </Link>

        <button
          type="button"
          aria-label={`Add ${product.name} to wishlist`}
          className="absolute right-2 top-2 inline-flex size-10 items-center justify-center rounded-full bg-card/75 text-foreground backdrop-blur-sm transition-colors duration-200 hover:bg-card"
        >
          <LuHeart className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-1.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={product.href} className="min-w-0 flex-1 text-sm leading-5 text-foreground hover:underline">
            <span className="block truncate capitalize">{product.name}</span>
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-foreground">
            <FaStar className="size-3 text-foreground" aria-hidden="true" />
            {product.rating}
          </span>
        </div>
        <p className="text-sm capitalize text-muted-foreground">{product.fit}</p>
        <p className="text-sm text-muted-foreground">{product.color}</p>
        <p className="text-sm font-bold text-foreground">{product.price}</p>
      </div>
    </article>
  );
}

export function CatalogProductGrid() {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-auth-heading text-lg font-bold uppercase tracking-wider text-card-foreground">
          Catalog
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {CATALOG_PLACEHOLDER_PRODUCTS.length} products
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-3 xl:grid-cols-4">
        {CATALOG_PLACEHOLDER_PRODUCTS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
