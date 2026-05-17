import { HttpException } from '@nestjs/common';
import { parseOrderNumberOrThrow } from '../../src/orders/orders.schemas.js';

describe('orders schemas', () => {
  it('normalizes valid order number to uppercase', () => {
    expect(parseOrderNumberOrThrow(' sp-20260517-ab12cd ')).toBe('SP-20260517-AB12CD');
  });

  it('rejects malformed order number', () => {
    expect(() => parseOrderNumberOrThrow('order-123')).toThrow(HttpException);
  });
});
