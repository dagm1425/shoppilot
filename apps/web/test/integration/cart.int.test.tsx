import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000';

import { AddToCartButton } from '../../components/cart-wishlist/add-to-cart-button';
import { CartPageContent } from '../../components/cart-wishlist/cart-page-content';
import { useAuthStore } from '../../lib/auth-store';
import { useCartUiStore } from '../../lib/cart-ui-store';

const replaceMock = jest.fn();
const pushMock = jest.fn();
const routerMock = {
  replace: replaceMock,
  push: pushMock,
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/cart',
}));

function buildFetchResponse<T>(payload: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function buildCartResponse(overrides?: Partial<{
  quantity: number;
  stock: number;
  isValid: boolean;
  invalidReason: 'PRODUCT_UNAVAILABLE' | 'INSUFFICIENT_STOCK';
  subtotalCents: number;
}>) {
  const quantity = overrides?.quantity ?? 1;
  const stock = overrides?.stock ?? 5;
  const isValid = overrides?.isValid ?? true;
  const subtotalCents = overrides?.subtotalCents ?? (isValid ? 3000 * quantity : 0);

  return {
    items: [
      {
        itemId: 'item_1',
        productId: 'arrival-oversized-tank',
        name: 'Arrival Oversized Tank',
        fit: 'Oversized fit',
        color: 'Force Blue',
        size: 'm',
        quantity,
        stock,
        available: true,
        priceCents: 3000,
        currency: 'USD',
        primaryImageUrl: 'https://example.com/arrival-a.jpg',
        secondaryImageUrl: 'https://example.com/arrival-b.jpg',
        isValid,
        invalidReason: overrides?.invalidReason,
        lineSubtotalCents: subtotalCents,
      },
    ],
    summary: {
      itemCount: quantity,
      validLineCount: isValid ? 1 : 0,
      subtotalCents,
      currency: 'USD',
    },
  };
}

describe('Cart UI integration', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    useAuthStore.setState({ user: null, sessionChecked: false });
    useCartUiStore.setState({ itemCount: 0, cart: null, pendingActionKeys: [] });
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
    });
  });

  it('renders cart lines and summary from successful fetch', async () => {
    fetchMock.mockResolvedValueOnce(buildFetchResponse(buildCartResponse()));

    render(React.createElement(CartPageContent));

    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arrival Oversized Tank' })).toBeInTheDocument();
    expect(screen.getAllByText('$30.00').length).toBeGreaterThan(0);
  });

  it('renders empty state when cart has no items', async () => {
    fetchMock.mockResolvedValueOnce(
      buildFetchResponse({
        items: [],
        summary: {
          itemCount: 0,
          validLineCount: 0,
          subtotalCents: 0,
          currency: 'USD',
        },
      }),
    );

    render(React.createElement(CartPageContent));

    expect(await screen.findByText('Your bag is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse catalog' })).toBeInTheDocument();
  });

  it('applies quantity update responses after user interaction', async () => {
    fetchMock
      .mockResolvedValueOnce(buildFetchResponse(buildCartResponse({ quantity: 1, subtotalCents: 3000 })))
      .mockResolvedValueOnce(buildFetchResponse(buildCartResponse({ quantity: 2, subtotalCents: 6000 })));

    render(React.createElement(CartPageContent));

    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Increase quantity'));

    await waitFor(() => {
      expect(screen.getAllByText('$60.00').length).toBeGreaterThan(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patchCall = fetchMock.mock.calls[1];
    expect(String(patchCall?.[0])).toContain('/cart/items/item_1');
    expect((patchCall?.[1] as RequestInit | undefined)?.method).toBe('PATCH');
  });

  it('redirects to login when cart request is unauthorized', async () => {
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

    render(React.createElement(CartPageContent));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?redirect=%2Fcart');
    });
  });

  it('AddToCartButton posts quantity-aware payload and syncs cart count', async () => {
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
              itemId: 'item_1',
              productId: 'arrival-oversized-tank',
              name: 'Arrival Oversized Tank',
              fit: 'Oversized fit',
              color: 'Force Blue',
              size: 'm',
              quantity: 2,
              stock: 5,
              available: true,
              priceCents: 3000,
              currency: 'USD',
              primaryImageUrl: 'https://example.com/arrival-a.jpg',
              secondaryImageUrl: null,
              isValid: true,
              lineSubtotalCents: 6000,
            },
          ],
          summary: {
            itemCount: 2,
            validLineCount: 1,
            subtotalCents: 6000,
            currency: 'USD',
          },
        },
        201,
      ),
    );

    render(
      React.createElement(AddToCartButton, {
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 2,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to bag' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain('/cart/items');
    expect((request?.[1] as RequestInit | undefined)?.method).toBe('POST');
    expect((request?.[1] as RequestInit | undefined)?.body).toBe(
      JSON.stringify({ productId: 'arrival-oversized-tank', size: 'm', quantity: 2 }),
    );

    expect(useCartUiStore.getState().itemCount).toBe(2);
  });

  it('AddToCartButton redirects to login on unauthorized mutation', async () => {
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
      React.createElement(AddToCartButton, {
        productId: 'arrival-oversized-tank',
        size: 'm',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to bag' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?redirect=%2Fcart');
    });
  });
});
