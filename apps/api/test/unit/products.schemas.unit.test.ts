import {
  parseAdminCreateProductBodyOrThrow,
  parseAdminMediaPresignBodyOrThrow,
  parseAdminUpdateProductBodyOrThrow,
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

function expectValidationCode(error: unknown) {
  expect((error as { getResponse?: () => { code?: string } }).getResponse?.().code).toBe(
    'PRODUCT_VALIDATION_ERROR',
  );
}

describe('admin product schema validation', () => {
  it('accepts valid media presign payloads', () => {
    expect(
      parseAdminMediaPresignBodyOrThrow({
        fileName: 'launch-image.webp',
        contentType: 'image/webp',
        sizeBytes: 2048,
        role: 'primary',
      }),
    ).toEqual({
      fileName: 'launch-image.webp',
      contentType: 'image/webp',
      sizeBytes: 2048,
      role: 'primary',
    });
  });

  it('rejects create payloads that reuse object keys across primary/secondary media', () => {
    expect(() =>
      parseAdminCreateProductBodyOrThrow({
        name: 'Velocity Training Tee',
        description: 'Lightweight and breathable training tee for daily sessions.',
        category: 'tops',
        gender: 'men',
        fit: 'Athletic',
        color: 'Black',
        priceCents: 3900,
        stock: 24,
        available: true,
        media: {
          primary: {
            objectKey: 'products/2026/05/shared.webp',
            url: 'https://cdn.example.com/products/2026/05/shared.webp',
            contentType: 'image/webp',
            sizeBytes: 204_800,
          },
          secondary: {
            objectKey: 'products/2026/05/shared.webp',
            url: 'https://cdn.example.com/products/2026/05/shared.webp',
            contentType: 'image/webp',
            sizeBytes: 180_120,
          },
        },
      }),
    ).toThrow();
  });

  it('rejects empty updates and accepts partial update payloads', () => {
    try {
      parseAdminUpdateProductBodyOrThrow({});
      throw new Error('Expected validation error');
    } catch (error) {
      expectValidationCode(error);
    }

    expect(
      parseAdminUpdateProductBodyOrThrow({
        priceCents: 4200,
        stock: 17,
      }),
    ).toEqual({
      priceCents: 4200,
      stock: 17,
    });
  });
});
