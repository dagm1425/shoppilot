import { parseOrThrow, registerSchema } from '../../src/auth/auth.schemas.js';

describe('auth schema validation', () => {
  it('accepts a valid registration payload', () => {
    const parsed = parseOrThrow(registerSchema, {
      email: 'Customer@ShopPilot.Local',
      password: 'ValidPass123',
    });

    expect(parsed.email).toBe('customer@shoppilot.local');
  });

  it('rejects weak passwords', () => {
    expect(() =>
      parseOrThrow(registerSchema, {
        email: 'customer@shoppilot.local',
        password: 'weakpass',
      }),
    ).toThrow();
  });
});
