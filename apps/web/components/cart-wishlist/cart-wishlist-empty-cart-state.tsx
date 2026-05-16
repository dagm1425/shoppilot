import Link from 'next/link';
import { LuShoppingBag } from 'react-icons/lu';

type CartWishlistEmptyCartStateProps = {
  onNavigate?: () => void;
};

export function CartWishlistEmptyCartState({ onNavigate }: CartWishlistEmptyCartStateProps) {
  return (
    <section className="px-6 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-[19rem] flex-col items-center text-center">
        <div className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-muted text-foreground">
          <LuShoppingBag className="size-7" aria-hidden="true" />
        </div>
        <h3 className="font-auth-heading text-base font-bold uppercase tracking-wide text-foreground">
          Your bag is empty
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">There are no products in your bag</p>
        <div className="mt-6 w-full space-y-3">
          <Link
            href="/catalog?gender=men"
            onClick={onNavigate}
            className="inline-flex h-11 w-full items-center justify-center rounded-pill bg-foreground px-5 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-background"
          >
            Shop Mens
          </Link>
          <Link
            href="/catalog?gender=women"
            onClick={onNavigate}
            className="inline-flex h-11 w-full items-center justify-center rounded-pill bg-foreground px-5 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-background"
          >
            Shop Womens
          </Link>
        </div>
      </div>
    </section>
  );
}
