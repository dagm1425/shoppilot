import { HttpException } from '@nestjs/common';
import {
  parseCheckoutProviderSessionIdOrThrow,
  parseCheckoutSessionTokenOrThrow,
  parsePlaceOrderInputOrThrow,
  parseSelectCheckoutAddressInputOrThrow,
  parseUpdateCheckoutContactInputOrThrow,
} from '../../src/checkout/checkout.schemas.js';

describe('checkout schemas', () => {
  it('parses valid token and address selection payload', () => {
    expect(parseCheckoutSessionTokenOrThrow(' token_123 ')).toBe('token_123');
    expect(parseCheckoutProviderSessionIdOrThrow(' cs_test_123 ')).toBe('cs_test_123');

    expect(parseSelectCheckoutAddressInputOrThrow({ addressId: ' addr_1 ' })).toEqual({
      addressId: 'addr_1',
    });
  });

  it('normalizes valid contact payload', () => {
    const parsed = parseUpdateCheckoutContactInputOrThrow({
      email: ' USER@Example.com ',
      phone: ' +251 900 000 000 ',
    });

    expect(parsed).toEqual({
      email: 'USER@Example.com',
      phone: '+251 900 000 000',
    });
  });

  it('rejects invalid email and phone', () => {
    expect(() =>
      parseUpdateCheckoutContactInputOrThrow({
        email: 'not-an-email',
        phone: 'bad',
      }),
    ).toThrow(HttpException);
  });

  it('rejects missing provider session id query input', () => {
    expect(() => parseCheckoutProviderSessionIdOrThrow(undefined)).toThrow(HttpException);
  });

  it('parses valid place-order payload', () => {
    expect(
      parsePlaceOrderInputOrThrow({
        checkoutSessionToken: ' checkout_token_1 ',
        idempotencyKey: ' order:checkout_token_1:cs_test_1 ',
      }),
    ).toEqual({
      checkoutSessionToken: 'checkout_token_1',
      idempotencyKey: 'order:checkout_token_1:cs_test_1',
    });
  });

  it('rejects invalid place-order idempotency key', () => {
    expect(() =>
      parsePlaceOrderInputOrThrow({
        checkoutSessionToken: 'checkout_token_1',
        idempotencyKey: 'bad key with spaces',
      }),
    ).toThrow(HttpException);
  });
});
