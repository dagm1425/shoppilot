import type { CartLineItem, CartSummary } from './cart-contract.js';

export type CheckoutReadinessStatus = 'ready' | 'blocked';

export type CheckoutBlockingReasonCode =
  | 'ADDRESS_REQUIRED'
  | 'CONTACT_REQUIRED';

export type CheckoutBlockingReason = {
  code: CheckoutBlockingReasonCode;
  message: string;
};

export type CheckoutCartSnapshot = {
  items: CartLineItem[];
  summary: CartSummary;
};

export type CheckoutSessionContact = {
  email: string | null;
  phone: string | null;
};

export type CheckoutSessionResponse = {
  sessionToken: string;
  expiresAt: string;
  readinessStatus: CheckoutReadinessStatus;
  blockingReasons: CheckoutBlockingReason[];
  selectedAddressId: string | null;
  contact: CheckoutSessionContact;
  cartSnapshot: CheckoutCartSnapshot;
  priceValidatedAt: string;
  pricing: CheckoutPricingBreakdown;
};

export type CheckoutPricingBreakdown = {
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
};

export type CreateCheckoutPaymentSessionResponse = {
  sessionToken: string;
  provider: 'stripe';
  providerSessionId: string;
  checkoutUrl: string;
};

export type CheckoutPaymentStatus = 'pending' | 'open' | 'paid' | 'failed' | 'expired' | 'canceled';

export type CheckoutPaymentStatusResponse = {
  sessionToken: string;
  provider: 'stripe';
  providerSessionId: string | null;
  status: CheckoutPaymentStatus;
};

export type SelectCheckoutAddressInput = {
  addressId: string;
};

export type UpdateCheckoutContactInput = {
  email: string;
  phone: string;
};
