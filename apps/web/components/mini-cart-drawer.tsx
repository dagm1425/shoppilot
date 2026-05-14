'use client';

import { useEffect } from 'react';
import {
  FaCcAmex,
  FaCcApplePay,
  FaCcMastercard,
  FaCcPaypal,
  FaCcVisa,
} from 'react-icons/fa6';
import {
  LuClock3,
  LuHeart,
  LuInfo,
  LuLock,
  LuMinus,
  LuPlus,
  LuShoppingBag,
  LuTruck,
  LuX,
  LuZap,
} from 'react-icons/lu';

type MiniCartDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type MiniCartItem = {
  id: string;
  title: string;
  details: string;
  price: string;
  quantity: number;
  image: string;
  isNew?: boolean;
};

const CART_ITEMS: MiniCartItem[] = [
  {
    id: 'vital-tank',
    title: 'Vital Tank',
    details: 'White/Port - S - Slim Fit',
    price: 'US$40',
    quantity: 1,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=300&auto=format&fit=crop',
    isNew: true,
  },
];

const PAYMENT_ICONS = [
  { icon: FaCcVisa, label: 'Visa' },
  { icon: FaCcMastercard, label: 'Mastercard' },
  { icon: FaCcAmex, label: 'American Express' },
  { icon: FaCcPaypal, label: 'PayPal' },
  { icon: FaCcApplePay, label: 'Apple Pay' },
];

export function MiniCartDrawer({ open, onClose }: MiniCartDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      <button
        type="button"
        aria-label="Close cart"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/80"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className="absolute right-0 top-0 flex h-dvh w-full max-w-[31.25rem] flex-col bg-card font-auth-body shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between bg-card px-5 py-5 sm:px-8 sm:py-6">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Your bag
          </h2>

          <div className="flex items-center gap-4">
            <div className="inline-flex h-10 min-w-28 items-center rounded-full bg-muted p-1">
              <span className="inline-flex h-full flex-1 items-center justify-center gap-1 rounded-full bg-foreground px-2 font-auth-heading text-[0.6875rem] font-bold uppercase tracking-wider text-background">
                <LuShoppingBag className="size-3.5" aria-hidden="true" />
                Bag
              </span>
              <span className="inline-flex h-full flex-1 items-center justify-center gap-1 px-2 font-auth-heading text-[0.6875rem] font-bold uppercase tracking-wider text-foreground">
                <LuHeart className="size-3.5" aria-hidden="true" />
                Wishlist
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close cart"
              className="inline-flex size-8 items-center justify-center text-foreground transition-colors duration-200 hover:text-muted-foreground"
            >
              <LuX className="size-6" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto pb-32 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1"
        >
          <section className="px-5 pb-2 pt-4 sm:px-8">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-200 hover:underline"
            >
              Delivery and Shipping Information
              <LuInfo className="size-4" aria-hidden="true" />
            </button>
          </section>

          <section className="mx-5 mt-4 rounded-sm bg-muted p-4 sm:mx-8">
            <div className="flex items-start gap-3">
              <LuClock3 className="mt-0.5 size-4 text-foreground" aria-hidden="true" />
              <p className="text-sm leading-5 text-foreground">
                <span className="font-bold">Your items are not reserved</span>, checkout quickly to
                make sure you do not miss out.
              </p>
            </div>
          </section>

          <section className="mt-8 px-5 sm:px-8">
            <ul className="space-y-6">
              {CART_ITEMS.map((item) => (
                <li key={item.id} className="flex gap-4">
                  <a href="#" className="h-[5.375rem] w-[4.375rem] shrink-0 overflow-hidden rounded-sm bg-muted">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  </a>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {item.isNew ? (
                          <span className="mb-1 inline-flex rounded-sm bg-muted px-1.5 py-0.5 font-auth-heading text-[0.5625rem] font-bold uppercase tracking-wider text-foreground">
                            New
                          </span>
                        ) : null}
                        <h3 className="text-sm leading-tight text-foreground">{item.title}</h3>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">{item.details}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Move to wishlist"
                        className="inline-flex size-7 items-center justify-center text-foreground transition-colors duration-200 hover:text-muted-foreground"
                      >
                        <LuHeart className="size-4.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-end justify-between pt-4">
                      <p className="text-sm font-bold text-foreground">{item.price}</p>
                      <div className="inline-flex items-center rounded-sm border border-border">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          className="inline-flex size-8 items-center justify-center text-foreground transition-colors duration-200 hover:bg-muted"
                        >
                          <LuMinus className="size-3.5" aria-hidden="true" />
                        </button>
                        <span className="w-6 text-center text-xs text-foreground">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          className="inline-flex size-8 items-center justify-center text-foreground transition-colors duration-200 hover:bg-muted"
                        >
                          <LuPlus className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-8 mt-10 space-y-4 px-5 sm:px-8">
            <h4 className="font-auth-heading text-xs font-bold uppercase tracking-wider text-foreground">
              Order summary
            </h4>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Sub Total</span>
              <span>US$40</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Estimated Shipping</span>
              <span>US$9.50</span>
            </div>
            <div className="flex justify-between border-t border-border pt-4 text-sm font-bold text-foreground">
              <span>Total</span>
              <span>US$49.50</span>
            </div>
          </section>

          <section className="mb-8 rounded-sm border border-border p-4 mx-5 sm:mx-8">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <LuTruck className="mt-0.5 size-4 text-foreground" aria-hidden="true" />
                <p className="text-sm leading-5 text-foreground">
                  Prices and thresholds vary. Refer to our delivery information.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <LuZap className="mt-0.5 size-4 text-foreground" aria-hidden="true" />
                <p className="text-sm leading-5 text-foreground">Express Delivery Available</p>
              </li>
            </ul>
          </section>
        </div>

        <footer className="sticky bottom-0 z-10 space-y-4 border-t border-border bg-card p-4">
          <a
            href="#"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 font-auth-heading text-sm font-bold uppercase tracking-wider text-background transition-colors duration-200 hover:bg-foreground/90"
          >
            Checkout securely
            <LuLock className="size-4" aria-hidden="true" />
          </a>

          <div className="flex items-center justify-center gap-3 pb-1 pt-0.5 text-2xl text-muted-foreground">
            {PAYMENT_ICONS.map((method) => {
              const Icon = method.icon;
              return <Icon key={method.label} aria-label={method.label} title={method.label} />;
            })}
          </div>
        </footer>
      </aside>
    </div>
  );
}
