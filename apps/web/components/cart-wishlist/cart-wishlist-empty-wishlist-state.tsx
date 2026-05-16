import Link from 'next/link';
import { LuHeart } from 'react-icons/lu';

type CartWishlistEmptyWishlistStateProps = {
  signedIn: boolean;
  onNavigate?: () => void;
};

export function CartWishlistEmptyWishlistState({
  signedIn,
  onNavigate,
}: CartWishlistEmptyWishlistStateProps) {
  if (!signedIn) {
    return (
      <section className="px-6 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-[19rem] flex-col items-center text-center">
          <div className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-muted text-foreground">
            <LuHeart className="size-7" aria-hidden="true" />
          </div>
          <h3 className="font-auth-heading text-base font-bold uppercase tracking-wide text-foreground">
            Save to wishlist
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to save your favorite products and come back to them anytime.
          </p>
          <div className="mt-6 w-full space-y-3">
            <Link
              href="/register"
              onClick={onNavigate}
              className="inline-flex h-11 w-full items-center justify-center rounded-pill bg-foreground px-5 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-background"
            >
              Create account
            </Link>
            <Link
              href="/login"
              onClick={onNavigate}
              className="inline-flex h-11 w-full items-center justify-center rounded-pill border border-border bg-background px-5 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-foreground"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-[19rem] flex-col items-center text-center">
        <div className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-muted text-foreground">
          <LuHeart className="size-7" aria-hidden="true" />
        </div>
        <h3 className="font-auth-heading text-base font-bold uppercase tracking-wide text-foreground">
          Your wishlist is empty
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">Save pieces you love to revisit them quickly.</p>
        <Link
          href="/catalog"
          onClick={onNavigate}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-pill border border-border bg-background px-5 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-foreground"
        >
          Browse catalog
        </Link>
      </div>
    </section>
  );
}
