'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LuChevronDown,
  LuHeart,
  LuMenu,
  LuSearch,
  LuShoppingBag,
  LuUser,
  LuX,
} from 'react-icons/lu';
import { MiniCartDrawer } from './mini-cart-drawer';
import { cn } from '../lib/utils';

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
    href: '/catalog?segment=women',
    items: [
      { label: 'New Arrivals', href: '/catalog?segment=women&sort=new' },
      { label: 'Leggings', href: '/catalog?segment=women&category=leggings' },
      { label: 'Tops', href: '/catalog?segment=women&category=tops' },
      { label: 'Training Sets', href: '/catalog?segment=women&category=sets' },
    ],
  },
  {
    label: 'Men',
    href: '/catalog?segment=men',
    items: [
      { label: 'New Arrivals', href: '/catalog?segment=men&sort=new' },
      { label: 'Oversized Tees', href: '/catalog?segment=men&category=tees' },
      { label: 'Joggers', href: '/catalog?segment=men&category=joggers' },
      { label: 'Shorts', href: '/catalog?segment=men&category=shorts' },
    ],
  },
  {
    label: 'Accessories',
    href: '/catalog?segment=accessories',
    items: [
      { label: 'Bags', href: '/catalog?segment=accessories&category=bags' },
      { label: 'Bottles', href: '/catalog?segment=accessories&category=bottles' },
      { label: 'Socks', href: '/catalog?segment=accessories&category=socks' },
      { label: 'All Accessories', href: '/catalog?segment=accessories' },
    ],
  },
];

type DesktopCategoryProps = {
  category: NavCategory;
};

function DesktopCategory({ category }: DesktopCategoryProps) {
  return (
    <div className="group/category relative h-full">
      <Link
        href={category.href}
        className="inline-flex h-full items-center px-3 font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:text-primary focus-visible:text-primary"
      >
        {category.label}
      </Link>

      <section
        className={cn(
          'pointer-events-none invisible absolute left-1/2 top-full z-50 w-72 -translate-x-1/2 border border-border bg-card opacity-0 shadow-lg transition',
          'group-hover/category:pointer-events-auto group-hover/category:visible group-hover/category:opacity-100',
          'group-focus-within/category:pointer-events-auto group-focus-within/category:visible group-focus-within/category:opacity-100',
        )}
      >
        <ul className="space-y-2 p-4">
          {category.items.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="block rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:bg-muted focus-visible:text-primary"
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
              className="block rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted hover:text-primary"
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
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
    setMiniCartOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-3 sm:px-5 lg:px-8">
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
          ShopPilot
        </Link>

        <nav className="hidden h-full items-center pl-4 lg:flex" aria-label="Primary categories">
          {navCategories.map((category) => (
            <DesktopCategory key={category.label} category={category} />
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <label htmlFor="desktop-nav-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="desktop-nav-search"
              type="search"
              placeholder="What are you looking for?"
              className="h-10 w-72 rounded-full border border-border bg-muted pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <Link
            href="/account"
            aria-label="Wishlist"
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuHeart className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuUser className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label="Cart"
            onClick={() => setMiniCartOpen(true)}
            className="relative inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuShoppingBag className="size-4" aria-hidden="true" />
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold leading-4 text-background">
              0
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
          <Link
            href="/account"
            aria-label="Account"
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuUser className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label="Cart"
            onClick={() => setMiniCartOpen(true)}
            className="relative inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <LuShoppingBag className="size-4" aria-hidden="true" />
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold leading-4 text-background">
              0
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-border px-3 py-3 md:hidden">
        <label htmlFor="mobile-nav-search" className="sr-only">
          Search products
        </label>
        <div className="flex h-10 items-center rounded-full border border-border bg-muted px-3">
          <LuSearch className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            id="mobile-nav-search"
            type="search"
            placeholder="Search catalog"
            className="ml-2 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-border bg-background px-3 py-4 md:hidden">
          <nav className="space-y-3" aria-label="Mobile categories">
            {navCategories.map((category) => (
              <MobileCategory key={category.label} category={category} />
            ))}
          </nav>
        </div>
      ) : null}

      <MiniCartDrawer open={miniCartOpen} onClose={() => setMiniCartOpen(false)} />
    </header>
  );
}
