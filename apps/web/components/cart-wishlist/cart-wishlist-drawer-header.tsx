'use client';

import { LuHeart, LuShoppingBag, LuX } from 'react-icons/lu';

type DrawerTab = 'cart' | 'wishlist';

type CartWishlistDrawerHeaderProps = {
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
};

export function CartWishlistDrawerHeader({
  activeTab,
  onTabChange,
  onClose,
}: CartWishlistDrawerHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4 sm:px-8">
      <div className="flex items-center justify-between">
        <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
          {activeTab === 'cart' ? 'Your bag' : 'Wishlist'}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:text-muted-foreground"
        >
          <LuX className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative mt-3 inline-flex h-10 w-28 items-center gap-1 rounded-full bg-muted p-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 h-8 w-12 rounded-full bg-foreground transition-transform duration-200 ease-in-out"
          style={{
            transform: activeTab === 'wishlist' ? 'translateX(3.25rem)' : 'translateX(0)',
          }}
        />
        <button
          type="button"
          onClick={() => onTabChange('cart')}
          aria-label="Cart tab"
          className={`relative z-10 inline-flex h-full w-12 items-center justify-center rounded-full transition-colors ${
            activeTab === 'cart' ? 'text-background' : 'text-foreground hover:bg-background'
          }`}
        >
          <LuShoppingBag className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onTabChange('wishlist')}
          aria-label="Wishlist tab"
          className={`relative z-10 inline-flex h-full w-12 items-center justify-center rounded-full transition-colors ${
            activeTab === 'wishlist' ? 'text-background' : 'text-foreground hover:bg-background'
          }`}
        >
          <LuHeart className="size-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
