import React from 'react';
import { render } from '@testing-library/react';
import HomePage from '../../app/(customer)/page';

const redirectMock = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

describe('HomePage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it('redirects customer home to /catalog', () => {
    render(React.createElement(HomePage));

    expect(redirectMock).toHaveBeenCalledWith('/catalog');
  });
});
