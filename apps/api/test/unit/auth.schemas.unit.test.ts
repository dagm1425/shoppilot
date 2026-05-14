import { parseOrThrow, registerSchema } from '../../src/auth/auth.schemas.js';

describe('auth schema validation', () => {
  it('accepts a valid registration payload', () => {
    const parsed = parseOrThrow(registerSchema, {
      username: 'Customer_01',
      email: 'Customer@ShopPilot.Local',
      password: 'ValidPass123',
    });

    expect(parsed.username).toBe('customer_01');
    expect(parsed.email).toBe('customer@shoppilot.local');
  });

  it('rejects weak passwords', () => {
    expect(() =>
      parseOrThrow(registerSchema, {
        username: 'customer_02',
        email: 'customer@shoppilot.local',
        password: 'weakpass',
      }),
    ).toThrow();
  });

  it('rejects invalid usernames', () => {
    expect(() =>
      parseOrThrow(registerSchema, {
        username: 'bad-name',
        email: 'customer@shoppilot.local',
        password: 'ValidPass123',
      }),
    ).toThrow();
  });
});
