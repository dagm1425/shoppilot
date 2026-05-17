import { HttpException } from '@nestjs/common';
import {
  parseAdminOrdersListQueryOrThrow,
  parseOrderNumberOrThrow,
} from '../../src/orders/orders.schemas.js';

describe('orders schemas', () => {
  it('normalizes valid order number to uppercase', () => {
    expect(parseOrderNumberOrThrow(' sp-20260517-ab12cd ')).toBe('SP-20260517-AB12CD');
  });

  it('rejects malformed order number', () => {
    expect(() => parseOrderNumberOrThrow('order-123')).toThrow(HttpException);
  });

  it('parses admin orders list query with defaults', () => {
    expect(parseAdminOrdersListQueryOrThrow({})).toEqual({
      page: 1,
      pageSize: 10,
      status: undefined,
      customer: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('rejects date window when dateFrom is after dateTo', () => {
    expect(() =>
      parseAdminOrdersListQueryOrThrow({
        dateFrom: '2026-05-10',
        dateTo: '2026-05-01',
      }),
    ).toThrow(HttpException);
  });
});
