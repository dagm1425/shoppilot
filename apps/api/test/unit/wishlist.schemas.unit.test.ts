import {
  parseAddWishlistItemOrThrow,
  parseWishlistItemIdOrThrow,
} from '../../src/wishlist/wishlist.schemas.js';

describe('wishlist schema validation', () => {
  it('accepts valid add payloads', () => {
    expect(
      parseAddWishlistItemOrThrow({
        productId: 'arrival-oversized-tank',
      }),
    ).toEqual({
      productId: 'arrival-oversized-tank',
    });
  });

  it('normalizes and rejects malformed product ids', () => {
    expect(
      parseAddWishlistItemOrThrow({
        productId: '  arrival-oversized-tank  ',
      }),
    ).toEqual({
      productId: 'arrival-oversized-tank',
    });

    expect(() =>
      parseAddWishlistItemOrThrow({
        productId: 'bad slug',
      }),
    ).toThrow();

    expect(() =>
      parseAddWishlistItemOrThrow({
        productId: '',
      }),
    ).toThrow();
  });

  it('accepts valid item ids and rejects empty values', () => {
    expect(parseWishlistItemIdOrThrow('wishlist_item_1')).toBe('wishlist_item_1');
    expect(() => parseWishlistItemIdOrThrow('')).toThrow();
  });
});
