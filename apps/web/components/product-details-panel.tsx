'use client';

import type { CartProductSize } from '@shoppilot/db/cart-contract';
import { useEffect, useState } from 'react';
import { LuMinus, LuPlus, LuShare2, LuStar } from 'react-icons/lu';
import { AddToCartButton } from './cart-wishlist/add-to-cart-button';
import { WishlistToggleButton } from './cart-wishlist/wishlist-toggle-button';

export type ProductDetails = {
  productId: string;
  name: string;
  description: string;
  fit: string;
  color: string;
  priceLabel: string;
  available: boolean;
  stock: number;
};

type ProductDetailsPanelProps = {
  product: ProductDetails;
};

const SIZE_OPTIONS: CartProductSize[] = ['s', 'm', 'l', 'xl'];

export function ProductDetailsPanel({ product }: ProductDetailsPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<CartProductSize | null>(null);

  const maxQuantity = Math.max(1, product.stock);

  useEffect(() => {
    setQuantity(1);
    setSelectedSize(null);
  }, [product.productId]);

  function handleDecreaseQuantity() {
    setQuantity((current) => Math.max(1, current - 1));
  }

  function handleIncreaseQuantity() {
    setQuantity((current) => Math.min(maxQuantity, current + 1));
  }

  return (
    <section className="w-full max-w-[25.625rem] font-auth-body">
      <header>
        <h1 className="font-auth-heading text-[1.125rem] font-bold uppercase leading-[1.35] text-foreground">
          {product.name}
        </h1>
        <p className="mt-1 text-sm capitalize leading-5 text-muted-foreground">{product.fit}</p>
        <p className="mt-2 text-sm font-bold leading-5 text-foreground">{product.priceLabel}</p>
      </header>

      <section className="flex items-center justify-between border-y border-border py-6">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm leading-5 text-foreground transition-colors hover:text-muted-foreground"
        >
          <LuStar className="size-3.5 fill-foreground text-foreground" aria-hidden="true" />
          <span>Reviews</span>
        </button>
        <div className="flex items-center gap-2">
          <WishlistToggleButton
            productId={product.productId}
            className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:text-muted-foreground disabled:opacity-70"
            iconClassName="size-4"
          />
          <button
            type="button"
            aria-label="Share product"
            className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:text-muted-foreground"
          >
            <LuShare2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center border border-border bg-muted" />
          <span className="text-sm leading-5 text-foreground">{product.color}</span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-sm leading-5 text-foreground">Select a size</p>
          <button
            type="button"
            className="text-xs font-bold leading-4 text-foreground underline underline-offset-2"
          >
            Size Guide
          </button>
        </div>

        <section className="rounded-sm border border-border p-2">
          <div className="grid grid-cols-4 gap-1">
            {SIZE_OPTIONS.map((size) => {
              const active = selectedSize === size;

              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedSize(size)}
                  className={`inline-flex h-12 items-center justify-center px-2 text-xs font-medium uppercase leading-3 transition-colors ${
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {size.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center py-4">
            <p className="text-center text-xs leading-4 text-muted-foreground">
              Customers say it fits{' '}
              <span className="font-medium text-foreground">true to size</span>
            </p>
          </div>
        </section>

        <div>
          {selectedSize ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Selected size: {selectedSize.toUpperCase()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Select a size before adding to bag.
            </p>
          )}
        </div>

        <div className="mb-4 mt-6 flex items-center justify-between gap-4">
          <p className="text-sm leading-5 text-foreground">Quantity</p>
          <div className="inline-flex items-center rounded-sm border border-border bg-card">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={handleDecreaseQuantity}
              disabled={!product.available || quantity <= 1}
              className="inline-flex size-9 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              <LuMinus className="size-3.5" aria-hidden="true" />
            </button>
            <span className="w-12 text-center text-sm text-foreground">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={handleIncreaseQuantity}
              disabled={!product.available || quantity >= maxQuantity}
              className="inline-flex size-9 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              <LuPlus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <AddToCartButton
          productId={product.productId}
          size={selectedSize ?? 'm'}
          quantity={quantity}
          disabled={!product.available || !selectedSize}
          label={product.available ? (selectedSize ? 'Add to bag' : 'Select size') : 'Out of stock'}
          onAdded={() => {
            window.dispatchEvent(new CustomEvent('cart:open-drawer'));
          }}
          className="inline-flex h-[3.375rem] w-full items-center justify-center gap-2 rounded-pill bg-foreground px-8 font-auth-heading text-sm font-bold uppercase tracking-[0.04em] text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted-foreground"
        />
        <p className="mt-2 text-xs leading-4 text-muted-foreground">
          {product.available
            ? `${product.stock} units available`
            : 'This item is currently unavailable.'}
        </p>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className="text-sm font-semibold uppercase leading-5 tracking-wide text-foreground">
          Description
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description}</p>
      </section>
    </section>
  );
}
