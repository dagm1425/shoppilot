import {
  buildPasswordResetUrl,
  PasswordResetMailerService,
} from '../../src/auth/password-reset-mailer.service.js';

describe('password reset mailer helpers', () => {
  it('builds reset links with token query param', () => {
    const url = buildPasswordResetUrl(
      'http://localhost:3000/reset-password',
      'token-123',
    );

    expect(url).toBe('http://localhost:3000/reset-password?token=token-123');
  });

  it('adds token while preserving existing query params', () => {
    const url = buildPasswordResetUrl(
      'http://localhost:3000/reset-password?source=email',
      'token-123',
    );

    expect(url).toBe(
      'http://localhost:3000/reset-password?source=email&token=token-123',
    );
  });

  it('instantiates mailer service', () => {
    const mailer = new PasswordResetMailerService();
    expect(mailer).toBeDefined();
  });
});
