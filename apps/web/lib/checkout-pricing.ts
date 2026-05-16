export const PHASE2_FIXED_SHIPPING_CENTS = 500;

export function getEstimatedShippingCents(subtotalCents: number): number {
  return subtotalCents > 0 ? PHASE2_FIXED_SHIPPING_CENTS : 0;
}

export function getCheckoutTotalCents(subtotalCents: number): number {
  return subtotalCents + getEstimatedShippingCents(subtotalCents);
}
