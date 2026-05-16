import type { CartLineItem } from '@shoppilot/db/cart-contract';
import { buildCartSummary, evaluateCartLine } from '../../src/cart/cart.policy.js';

describe('cart policy logic', () => {
  it('calculates valid line subtotals', () => {
    const result = evaluateCartLine({
      quantity: 2,
      available: true,
      stock: 5,
      unitPriceCents: 3000,
    });

    expect(result).toEqual({
      isValid: true,
      lineSubtotalCents: 6000,
    });
  });

  it('marks unavailable items invalid', () => {
    const result = evaluateCartLine({
      quantity: 1,
      available: false,
      stock: 0,
      unitPriceCents: 3000,
    });

    expect(result).toEqual({
      isValid: false,
      invalidReason: 'PRODUCT_UNAVAILABLE',
      lineSubtotalCents: 0,
    });
  });

  it('marks overstocked lines invalid and excludes them from totals', () => {
    const items: CartLineItem[] = [
      {
        itemId: 'item_1',
        productId: 'arrival-oversized-tank',
        name: 'Arrival Oversized Tank',
        fit: 'Oversized fit',
        color: 'Force Blue',
        size: 'm',
        quantity: 3,
        stock: 2,
        available: true,
        priceCents: 3000,
        currency: 'USD',
        primaryImageUrl: 'https://example.com/arrival.jpg',
        secondaryImageUrl: null,
        isValid: false,
        invalidReason: 'INSUFFICIENT_STOCK',
        lineSubtotalCents: 0,
      },
      {
        itemId: 'item_2',
        productId: 'essential-cropped-tee',
        name: 'Essential Cropped Tee',
        fit: 'Relaxed fit',
        color: 'White',
        size: 'm',
        quantity: 1,
        stock: 4,
        available: true,
        priceCents: 2400,
        currency: 'USD',
        primaryImageUrl: 'https://example.com/tee.jpg',
        secondaryImageUrl: null,
        isValid: true,
        lineSubtotalCents: 2400,
      },
    ];

    expect(buildCartSummary(items)).toEqual({
      itemCount: 4,
      validLineCount: 1,
      subtotalCents: 2400,
      currency: 'USD',
    });
  });
});
