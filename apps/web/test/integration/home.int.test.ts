import React from 'react';
import { render, screen } from '@testing-library/react';
import HomePage from '../../app/page';

describe('HomePage', () => {
  it('renders the foundation heading', () => {
    render(React.createElement(HomePage));

    expect(screen.getByText('ShopPilot Phase 0 Foundation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open health check' })).toBeInTheDocument();
  });
});
