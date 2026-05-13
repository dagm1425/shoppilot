import React from 'react';
import { render, screen } from '@testing-library/react';
import LoginPage from '../../app/login/page';
import RegisterPage from '../../app/register/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('Auth pages', () => {
  it('renders login route shell and actions', () => {
    render(React.createElement(LoginPage));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Sign in',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders register route shell and actions', () => {
    render(React.createElement(RegisterPage));

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Create account',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });
});
