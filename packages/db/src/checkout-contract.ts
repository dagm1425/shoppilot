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
};

export type SelectCheckoutAddressInput = {
  addressId: string;
};

export type UpdateCheckoutContactInput = {
  email: string;
  phone: string;
};
