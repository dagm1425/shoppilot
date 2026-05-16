import type {
  CartItemInvalidReason,
  CartLineItem,
  CartSummary,
} from '@shoppilot/db/cart-contract';

type EvaluateCartLineInput = {
  quantity: number;
  available: boolean;
  stock: number;
  unitPriceCents: number;
};

type EvaluateCartLineResult = {
  isValid: boolean;
  invalidReason?: CartItemInvalidReason;
  lineSubtotalCents: number;
};

export function evaluateCartLine({
  quantity,
  available,
  stock,
  unitPriceCents,
}: EvaluateCartLineInput): EvaluateCartLineResult {
  if (!available || stock < 1) {
    return {
      isValid: false,
      invalidReason: 'PRODUCT_UNAVAILABLE',
      lineSubtotalCents: 0,
    };
  }

  if (quantity > stock) {
    return {
      isValid: false,
      invalidReason: 'INSUFFICIENT_STOCK',
      lineSubtotalCents: 0,
    };
  }

  return {
    isValid: true,
    // future: checkout price lock - Phase 1 cart totals are pre-checkout estimates.
    lineSubtotalCents: quantity * unitPriceCents,
  };
}

export function buildCartSummary(
  items: CartLineItem[],
  fallbackCurrency = 'USD',
): CartSummary {
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const validLineCount = items.reduce(
    (total, item) => total + (item.isValid ? 1 : 0),
    0,
  );
  const subtotalCents = items.reduce(
    (total, item) => total + item.lineSubtotalCents,
    0,
  );

  return {
    itemCount,
    validLineCount,
    subtotalCents,
    currency: items[0]?.currency ?? fallbackCurrency,
  };
}
