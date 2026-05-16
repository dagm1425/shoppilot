import type { CatalogProductListItem } from '@shoppilot/db/catalog-contract';
import Link from 'next/link';
import { WishlistToggleButton } from '../cart-wishlist/wishlist-toggle-button';

type CatalogProductCardProps = {
  product: CatalogProductListItem;
  formatMoney: (cents: number, currency: string) => string;
};

export function CatalogProductCard({ product, formatMoney }: CatalogProductCardProps) {
  return (
    <article className="flex min-w-0 flex-col">
      <Link
        href={`/catalog/${product.productId}`}
        aria-label={product.name}
        className="group block"
      >
        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden bg-muted">
            <img
              src={product.primaryImageUrl}
              alt={`${product.name} image`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-0"
            />
            {product.secondaryImageUrl ? (
              <img
                src={product.secondaryImageUrl}
                alt={`${product.name} alternate image`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            ) : null}
          </div>

          <span className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-full bg-transparent">
            <WishlistToggleButton
              productId={product.productId}
              preventNavigationOnClick
              className="inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground transition-colors hover:text-muted-foreground disabled:opacity-70"
              iconClassName="size-4"
            />
          </span>

          {!product.available ? (
            <span className="absolute bottom-2 left-2 rounded-sm bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
              Out of stock
            </span>
          ) : null}
        </div>

        <div className="py-2">
          <p className="text-base font-normal leading-[1.4] text-foreground group-hover:underline">
            {product.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{product.fit}</p>
          <p className="mt-1 text-sm text-muted-foreground">{product.color}</p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {formatMoney(product.priceCents, product.currency)}
          </p>
        </div>
      </Link>
    </article>
  );
}
