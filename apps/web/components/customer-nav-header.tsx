'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  LuChevronDown,
  LuHeart,
  LuLogIn,
  LuLogOut,
  LuMenu,
  LuSearch,
  LuShoppingBag,
  LuUser,
  LuX,
} from 'react-icons/lu';
import { fetchMe, logout } from '../lib/auth-api';
import { useAuthStore } from '../lib/auth-store';
import { fetchCart } from '../lib/cart-api';
import { fetchWishlist } from '../lib/wishlist-api';
import { reportClientError } from '../lib/client-error';
import { cn } from '../lib/utils';
import { useCartUiStore } from '../lib/cart-ui-store';
import { useWishlistUiStore } from '../lib/wishlist-ui-store';
import { showToast } from '../lib/toast-store';
import { CartWishlistDrawer } from './cart-wishlist-drawer';

type NavCategory = {
  label: string;
  href: string;
  items: Array<{
    label: string;
    href: string;
  }>;
};

const navCategories: NavCategory[] = [
  {
    label: 'Women',
    href: '/catalog?gender=women',
    items: [
      { label: 'New Arrivals', href: '/catalog?gender=women&sort=newest' },
      { label: 'Bottoms', href: '/catalog?gender=women&category=bottoms' },
      { label: 'Tops', href: '/catalog?gender=women&category=tops' },
    ],
  },
  {
    label: 'Men',
    href: '/catalog?gender=men',
    items: [
      { label: 'New Arrivals', href: '/catalog?gender=men&sort=newest' },
      { label: 'Tops', href: '/catalog?gender=men&category=tops' },
      { label: 'Bottoms', href: '/catalog?gender=men&category=bottoms' },
    ],
  },
];

function resolveGreetingName(
  user: {
    username: string | null;
    email: string;
  } | null,
): string {
  if (!user) {
    return 'there';
  }

  if (user.username && user.username.trim().length > 0) {
    return user.username.trim();
  }

  const localPart = user.email.split('@')[0];
  if (localPart && localPart.trim().length > 0) {
    return localPart.trim();
  }

  return 'there';
}

type DesktopCategoryProps = {
  category: NavCategory;
};

function DesktopCategory({ category }: DesktopCategoryProps) {
  const [dismissedAfterSelection, setDismissedAfterSelection] = useState(false);

  return (
    <div
      className="group/category relative h-full"
      onMouseLeave={() => setDismissedAfterSelection(false)}
    >
      <Link
        href={category.href}
        className="inline-flex h-full items-center px-3 font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground"
      >
        {category.label}
      </Link>

      <section
        className={cn(
          'pointer-events-none invisible absolute left-1/2 top-full z-50 w-52 -translate-x-1/2 bg-card opacity-0 shadow-md transition',
          dismissedAfterSelection
            ? ''
            : 'group-hover/category:pointer-events-auto group-hover/category:visible group-hover/category:opacity-100',
          dismissedAfterSelection
            ? ''
            : 'group-focus-within/category:pointer-events-auto group-focus-within/category:visible group-focus-within/category:opacity-100',
        )}
      >
        <ul className="space-y-1 px-2 py-2">
          {category.items.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={(event) => {
                  setDismissedAfterSelection(true);
                  event.currentTarget.blur();
                }}
                className="block px-1 py-1.5 text-sm text-foreground transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MobileCategory({ category }: DesktopCategoryProps) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-auth-heading text-sm font-semibold uppercase tracking-wide text-foreground">
        <span>{category.label}</span>
        <LuChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="space-y-2 border-t border-border px-4 py-4">
        {category.items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-sm text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CustomerNavHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopAccountMenuOpen, setDesktopAccountMenuOpen] = useState(false);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCheckoutPending, setDrawerCheckoutPending] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'cart' | 'wishlist'>('cart');
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const cartItemCount = useCartUiStore((state) => state.itemCount);
  const syncCart = useCartUiStore((state) => state.syncCart);
  const resetSummary = useCartUiStore((state) => state.resetSummary);
  const syncWishlist = useWishlistUiStore((state) => state.syncWishlist);
  const resetWishlist = useWishlistUiStore((state) => state.resetWishlist);
  const user = useAuthStore((state) => state.user);
  const sessionChecked = useAuthStore((state) => state.sessionChecked);
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const desktopAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const drawerCheckoutPendingRef = useRef(false);
  const greetingName = useMemo(() => resolveGreetingName(user), [user]);

  useEffect(() => {
    drawerCheckoutPendingRef.current = drawerCheckoutPending;
  }, [drawerCheckoutPending]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopAccountMenuOpen(false);
    setMobileAccountMenuOpen(false);

    if (drawerCheckoutPendingRef.current && pathname === '/checkout') {
      return;
    }

    setDrawerOpen(false);

    if (drawerCheckoutPendingRef.current) {
      drawerCheckoutPendingRef.current = false;
      setDrawerCheckoutPending(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!drawerCheckoutPending) {
      return;
    }

    function handleCheckoutReady() {
      setDrawerOpen(false);
      setDrawerCheckoutPending(false);
      drawerCheckoutPendingRef.current = false;
    }

    window.addEventListener('checkout:ready', handleCheckoutReady);

    return () => {
      window.removeEventListener('checkout:ready', handleCheckoutReady);
    };
  }, [drawerCheckoutPending]);

  useEffect(() => {
    if (sessionChecked) {
      return;
    }

    let active = true;

    async function syncSession() {
      try {
        const result = await fetchMe();
        if (!active) {
          return;
        }

        if (!result.ok) {
          clearUser();
          resetSummary();
          resetWishlist();
          return;
        }

        setUser(result.data.user);
        const cartResult = await fetchCart();
        const wishlistResult = await fetchWishlist();
        if (!active) {
          return;
        }

        if (cartResult.ok) {
          syncCart(cartResult.data);
        } else {
          resetSummary();
        }

        if (wishlistResult.ok) {
          syncWishlist(wishlistResult.data);
        } else {
          resetWishlist();
        }
      } catch (error) {
        if (!active) {
          return;
        }

        reportClientError({ error, context: 'header:fetch-me' });
        clearUser();
        resetSummary();
        resetWishlist();
      }
    }

    void syncSession();

    return () => {
      active = false;
    };
  }, [clearUser, resetSummary, resetWishlist, sessionChecked, setUser, syncCart, syncWishlist]);

  useEffect(() => {
    if (!desktopAccountMenuOpen) {
      return;
    }

    function handleOutsidePointerDown(event: MouseEvent) {
      if (!desktopAccountMenuRef.current?.contains(event.target as Node)) {
        setDesktopAccountMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDesktopAccountMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handleOutsidePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [desktopAccountMenuOpen]);

  useEffect(() => {
    if (!mobileAccountMenuOpen) {
      return;
    }

    function handleOutsidePointerDown(event: MouseEvent) {
      if (!mobileAccountMenuRef.current?.contains(event.target as Node)) {
        setMobileAccountMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileAccountMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handleOutsidePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileAccountMenuOpen]);

  useEffect(() => {
    function handleOpenCartDrawer() {
      setDrawerInitialTab('cart');
      setDrawerOpen(true);
    }

    window.addEventListener('cart:open-drawer', handleOpenCartDrawer);

    return () => {
      window.removeEventListener('cart:open-drawer', handleOpenCartDrawer);
    };
  }, []);

  function navigateToSignIn() {
    setDesktopAccountMenuOpen(false);
    setMobileAccountMenuOpen(false);
    router.push('/login');
  }

  function openDrawer(tab: 'cart' | 'wishlist') {
    setDrawerInitialTab(tab);
    setDrawerOpen(true);
  }

  async function handleSignOut() {
    setAccountActionLoading(true);

    try {
      const result = await logout();
      if (!result.ok) {
        showToast({
          variant: 'error',
          message: result.message,
        });
        return;
      }

      clearUser();
      resetSummary();
      resetWishlist();
      setDesktopAccountMenuOpen(false);
      setMobileAccountMenuOpen(false);
      router.push('/login');
    } catch (error) {
      reportClientError({ error, context: 'header:logout' });
      showToast({
        variant: 'error',
        message: 'Unable to sign out right now.',
      });
    } finally {
      setAccountActionLoading(false);
    }
  }

  function submitCatalogSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const rawQuery = formData.get('q');
    const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    const params = new URLSearchParams({
      page: '1',
      pageSize: '12',
    });

    if (query.length > 0) {
      params.set('q', query);
    }

    router.push(`/catalog?${params.toString()}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="mx-auto flex h-16 w-full max-w-[92rem] items-center gap-2 px-3 sm:px-5 lg:px-8">
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted lg:hidden"
        >
          {mobileMenuOpen ? (
            <LuX className="size-5" aria-hidden="true" />
          ) : (
            <LuMenu className="size-5" aria-hidden="true" />
          )}
        </button>

        <Link
          href="/"
          className="shrink-0 font-auth-heading text-lg font-bold uppercase tracking-wide text-foreground"
        >
          Athlora
        </Link>

        <nav className="hidden h-full items-center pl-4 lg:flex" aria-label="Primary categories">
          {navCategories.map((category) => (
            <DesktopCategory key={category.label} category={category} />
          ))}
          <Link
            href="/catalog"
            className="inline-flex h-full items-center px-3 font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground"
          >
            See all
          </Link>
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <form onSubmit={submitCatalogSearch} className="relative">
            <label htmlFor="desktop-nav-search" className="sr-only">
              Search products
            </label>
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="desktop-nav-search"
              name="q"
              type="search"
              placeholder="What are you looking for?"
              className="h-10 w-72 rounded-full border border-border bg-muted pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-black focus:outline-none focus:ring-1 focus:ring-black focus:ring-offset-0"
            />
            <button type="submit" className="sr-only">
              Search
            </button>
          </form>
          <button
            type="button"
            aria-label="Wishlist"
            onClick={() => openDrawer('wishlist')}
            className="inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <LuHeart className="size-4" aria-hidden="true" />
          </button>
          <div ref={desktopAccountMenuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={desktopAccountMenuOpen}
              onClick={() => setDesktopAccountMenuOpen((open) => !open)}
              className="inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            >
              <LuUser className="size-4" aria-hidden="true" />
            </button>
            {desktopAccountMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] w-44 rounded-md border border-border bg-card p-2.5 shadow-md">
                {user ? (
                  <div className="space-y-3">
                    <p className="text-center text-base text-foreground">
                      Hi, <span className="font-semibold">{greetingName}</span>
                    </p>
                    {user.role === 'ADMIN' ? (
                      <Link
                        href="/admin"
                        onClick={() => setDesktopAccountMenuOpen(false)}
                        className="inline-flex w-full items-center justify-center rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background"
                      >
                        Admin workspace
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={accountActionLoading}
                      className="inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <LuLogOut className="size-4" aria-hidden="true" />
                      {accountActionLoading ? 'Signing out...' : 'Sign out'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={navigateToSignIn}
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background"
                  >
                    <LuLogIn className="size-4" aria-hidden="true" />
                    Sign in
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Cart"
            onClick={() => openDrawer('cart')}
            className="relative inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <LuShoppingBag className="size-4" aria-hidden="true" />
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold leading-4 text-background">
              {cartItemCount}
            </span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button
            type="button"
            aria-label="Search products"
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuSearch className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Wishlist"
            onClick={() => openDrawer('wishlist')}
            className="inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <LuHeart className="size-4" aria-hidden="true" />
          </button>
          <div ref={mobileAccountMenuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={mobileAccountMenuOpen}
              onClick={() => setMobileAccountMenuOpen((open) => !open)}
              className="inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            >
              <LuUser className="size-4" aria-hidden="true" />
            </button>
            {mobileAccountMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-44 rounded-md border border-border bg-card p-2.5 shadow-md">
                {user ? (
                  <div className="space-y-3">
                    <p className="text-center text-base text-foreground">
                      Hi, <span className="font-semibold">{greetingName}</span>
                    </p>
                    {user.role === 'ADMIN' ? (
                      <Link
                        href="/admin"
                        onClick={() => setMobileAccountMenuOpen(false)}
                        className="inline-flex w-full items-center justify-center rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background"
                      >
                        Admin workspace
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={accountActionLoading}
                      className="inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <LuLogOut className="size-4" aria-hidden="true" />
                      {accountActionLoading ? 'Signing out...' : 'Sign out'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={navigateToSignIn}
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background"
                  >
                    <LuLogIn className="size-4" aria-hidden="true" />
                    Sign in
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Cart"
            onClick={() => openDrawer('cart')}
            className="relative inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <LuShoppingBag className="size-4" aria-hidden="true" />
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold leading-4 text-background">
              {cartItemCount}
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-border px-3 py-3 md:hidden">
        <form onSubmit={submitCatalogSearch}>
          <label htmlFor="mobile-nav-search" className="sr-only">
            Search products
          </label>
          <div className="flex h-10 items-center rounded-full border border-border bg-muted px-3">
            <LuSearch className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="mobile-nav-search"
              name="q"
              type="search"
              placeholder="Search catalog"
              className="ml-2 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button type="submit" className="sr-only">
              Search
            </button>
          </div>
        </form>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-border bg-background px-3 py-4 md:hidden">
          <nav className="space-y-3" aria-label="Mobile categories">
            {navCategories.map((category) => (
              <MobileCategory key={category.label} category={category} />
            ))}
            <Link
              href="/catalog"
              className="block rounded-lg border border-border bg-card px-4 py-3 font-auth-heading text-sm font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted"
            >
              See all
            </Link>
          </nav>
        </div>
      ) : null}

      <CartWishlistDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerCheckoutPending(false);
          drawerCheckoutPendingRef.current = false;
        }}
        initialTab={drawerInitialTab}
        checkoutPending={drawerCheckoutPending}
        onCheckoutStart={() => setDrawerCheckoutPending(true)}
      />
    </header>
  );
}
