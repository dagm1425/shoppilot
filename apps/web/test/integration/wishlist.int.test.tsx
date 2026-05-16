import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000';

import { WishlistToggleButton } from '../../components/cart-wishlist/wishlist-toggle-button';
import { useAuthStore } from '../../lib/auth-store';
import { useWishlistUiStore } from '../../lib/wishlist-ui-store';

const replaceMock = jest.fn();
const routerMock = {
  replace: replaceMock,
  push: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/catalog',
}));

function buildFetchResponse<T>(payload: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('Wishlist UI integration', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    replaceMock.mockReset();
    useAuthStore.setState({ user: null, sessionChecked: false });
    useWishlistUiStore.setState({
      itemCount: 0,
      wishlist: null,
      productToItemMap: {},
      pendingActionKeys: [],
    });
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
    });
  });

  it('posts add request and syncs wishlist state on success', async () => {
    useAuthStore.setState({
      user: {
        id: 'user_1',
        username: 'customer_1',
        email: 'customer@shoppilot.local',
        role: 'CUSTOMER',
      },
      sessionChecked: true,
    });

    fetchMock.mockResolvedValueOnce(
      buildFetchResponse(
        {
          items: [
            {
              itemId: 'wishlist_item_1',
              productId: 'arrival-oversized-tank',
              name: 'Arrival Oversized Tank',
              fit: 'Oversized fit',
              color: 'Force Blue',
              available: true,
              stock: 5,
              priceCents: 3000,
              currency: 'USD',
              primaryImageUrl: 'https://example.com/arrival-a.jpg',
              secondaryImageUrl: null,
            },
          ],
          summary: {
            itemCount: 1,
          },
        },
        201,
      ),
    );

    render(
      React.createElement(WishlistToggleButton, {
        productId: 'arrival-oversized-tank',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain('/wishlist/items');
    expect((request?.[1] as RequestInit | undefined)?.method).toBe('POST');
    expect((request?.[1] as RequestInit | undefined)?.body).toBe(
      JSON.stringify({ productId: 'arrival-oversized-tank' }),
    );

    expect(useWishlistUiStore.getState().itemCount).toBe(1);
    expect(useWishlistUiStore.getState().productToItemMap['arrival-oversized-tank']).toBe(
      'wishlist_item_1',
    );

    expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeInTheDocument();
  });

  it('redirects to login and clears state on unauthorized response', async () => {
    useAuthStore.setState({
      user: {
        id: 'user_1',
        username: 'customer_1',
        email: 'customer@shoppilot.local',
        role: 'CUSTOMER',
      },
      sessionChecked: true,
    });

    fetchMock.mockResolvedValueOnce(
      buildFetchResponse(
        {
          error: {
            code: 'AUTH_UNAUTHORIZED',
            message: 'Authentication is required.',
          },
        },
        401,
      ),
    );

    render(
      React.createElement(WishlistToggleButton, {
        productId: 'arrival-oversized-tank',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?redirect=%2Fcatalog');
    });

    expect(useAuthStore.getState().user).toBeNull();
    expect(useWishlistUiStore.getState().itemCount).toBe(0);
  });
});
