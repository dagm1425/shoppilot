import {
  parseAddCartItemOrThrow,
  parseCartItemIdOrThrow,
  parseUpdateCartItemOrThrow,
} from '../../src/cart/cart.schemas.js';

describe('cart schema validation', () => {
  it('accepts valid add payloads and applies default quantity', () => {
    expect(
      parseAddCartItemOrThrow({ productId: 'arrival-oversized-tank', size: 'm' }),
    ).toEqual({
      productId: 'arrival-oversized-tank',
      size: 'm',
      quantity: 1,
    });

    expect(
      parseAddCartItemOrThrow({
        productId: 'arrival-oversized-tank',
        size: 'l',
        quantity: 3,
      }),
    ).toEqual({
      productId: 'arrival-oversized-tank',
      size: 'l',
      quantity: 3,
    });
  });

  it('rejects malformed product ids and quantities', () => {
    expect(() =>
      parseAddCartItemOrThrow({
        productId: 'bad slug',
        size: 'm',
        quantity: 1,
      }),
    ).toThrow();

    expect(() =>
      parseAddCartItemOrThrow({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 0,
      }),
    ).toThrow();

    expect(() =>
      parseAddCartItemOrThrow({
        productId: 'arrival-oversized-tank',
        size: 'xxl',
        quantity: 1,
      }),
    ).toThrow();

    expect(() =>
      parseAddCartItemOrThrow({
        productId: 'arrival-oversized-tank',
        quantity: 1,
      }),
    ).toThrow();
  });

  it('accepts valid update payload and rejects non-positive quantities', () => {
    expect(parseUpdateCartItemOrThrow({ quantity: 2 })).toEqual({ quantity: 2 });
    expect(() => parseUpdateCartItemOrThrow({ quantity: -1 })).toThrow();
  });

  it('accepts valid cart item ids and rejects empty ids', () => {
    expect(parseCartItemIdOrThrow('item_123')).toBe('item_123');
    expect(() => parseCartItemIdOrThrow('')).toThrow();
  });
});
