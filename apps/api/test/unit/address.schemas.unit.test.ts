import { HttpException } from '@nestjs/common';
import {
  parseAddressIdOrThrow,
  parseCreateAddressInputOrThrow,
  parseUpdateAddressInputOrThrow,
} from '../../src/address/address.schemas.js';

describe('address schemas', () => {
  it('normalizes valid create payload and uppercases country', () => {
    const parsed = parseCreateAddressInputOrThrow({
      recipientName: '  Dagmawi  ',
      country: 'et',
      city: 'Addis Ababa',
      postalCode: '2000',
      line1: 'Yeka',
      line2: ' ',
      phone: ' 0900000000 ',
      isDefault: true,
    });

    expect(parsed).toEqual({
      recipientName: 'Dagmawi',
      country: 'ET',
      city: 'Addis Ababa',
      postalCode: '2000',
      line1: 'Yeka',
      line2: undefined,
      phone: '0900000000',
      isDefault: true,
    });
  });

  it('rejects invalid country and malformed phone', () => {
    expect(() =>
      parseCreateAddressInputOrThrow({
        recipientName: 'User',
        country: 'ETH',
        city: 'Addis',
        postalCode: '2000',
        line1: 'Bole',
        phone: 'bad-phone',
      }),
    ).toThrow(HttpException);
  });

  it('requires at least one field for update payload', () => {
    expect(() => parseUpdateAddressInputOrThrow({})).toThrow(HttpException);
  });

  it('parses address id from route values', () => {
    expect(parseAddressIdOrThrow(' addr_1 ')).toBe('addr_1');
    expect(parseAddressIdOrThrow(['addr_2'])).toBe('addr_2');
  });
});
