import {
  parseCatalogListQueryOrThrow,
  parseCatalogProductIdOrThrow,
} from '../../src/products/products.schemas.js';

describe('catalog query schema validation', () => {
  it('applies defaults and clamps page/pageSize inputs', () => {
    const parsed = parseCatalogListQueryOrThrow({
      page: '-4',
      pageSize: '400',
    });

    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(36);
    expect(parsed.sort).toBe('relevance');
  });

  it('normalizes blank search input and accepts category + gender + price', () => {
    const parsed = parseCatalogListQueryOrThrow({
      category: 'tops',
      gender: 'men',
      price: '25-40',
      q: '   ',
    });

    expect(parsed.category).toBe('tops');
    expect(parsed.gender).toBe('men');
    expect(parsed.price).toBe('25-40');
    expect(parsed.q).toBeUndefined();
  });

  it('rejects invalid sort values with a validation error', () => {
    expect(() =>
      parseCatalogListQueryOrThrow({
        sort: 'recent',
      }),
    ).toThrow();
  });

  it('rejects invalid price range values with a validation error', () => {
    expect(() =>
      parseCatalogListQueryOrThrow({
        price: '40-100',
      }),
    ).toThrow();
  });

  it('accepts valid product ids and rejects malformed ids', () => {
    expect(parseCatalogProductIdOrThrow('arrival-oversized-tank')).toBe(
      'arrival-oversized-tank',
    );

    expect(() => parseCatalogProductIdOrThrow('bad slug')).toThrow();
  });
});
