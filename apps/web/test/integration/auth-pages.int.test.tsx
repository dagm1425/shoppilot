import React from 'react';
import { render, screen } from '@testing-library/react';
import LoginPage from '../../app/login/page';
import RegisterPage from '../../app/register/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('Auth pages', () => {
  it('renders login route shell and actions', async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Sign in',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Remember me')).toBeInTheDocument();
  });

  it('renders register route shell and actions', () => {
    render(React.createElement(RegisterPage));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Create account',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });
});
