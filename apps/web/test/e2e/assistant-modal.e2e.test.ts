import { test, expect, type Page } from '@playwright/test';

type CapturedAssistantBody = {
  message: string;
  sessionId: string;
};

function buildCorsHeaders(origin: string, contentType = 'application/json') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-request-id',
    'content-type': contentType,
  };
}

async function mockCustomerSessionBootstrap(page: Page) {
  await page.route('**/auth/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    const origin = request.headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.pathname.endsWith('/auth/me') && request.method() === 'GET') {
      await route.fulfill({
        status: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'AUTH_UNAUTHORIZED',
            message: 'Authentication is required.',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          message: 'Not found.',
        },
      }),
    });
  });
}

async function installAssistantStreamCaptureMock(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);

    const capturedBodies: CapturedAssistantBody[] = [];
    (window as Window & { __assistantCapturedBodies?: CapturedAssistantBody[] }).__assistantCapturedBodies =
      capturedBodies;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (!requestUrl.includes('/ai/chat/stream')) {
        return originalFetch(input, init);
      }

      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'POST') {
        return new Response('', {
          status: 405,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
        });
      }

      let bodyText = '';
      if (typeof init?.body === 'string') {
        bodyText = init.body;
      } else if (input instanceof Request) {
        bodyText = await input.clone().text();
      }

      let parsedBody: {
        message?: string;
        sessionId?: string;
      } = {};

      try {
        parsedBody = bodyText ? (JSON.parse(bodyText) as { message?: string; sessionId?: string }) : {};
      } catch {
        parsedBody = {};
      }

      const message = typeof parsedBody.message === 'string' ? parsedBody.message : '';
      const sessionId = typeof parsedBody.sessionId === 'string' ? parsedBody.sessionId : '';
      capturedBodies.push({ message, sessionId });

      // Keep stream unresolved for deterministic loading-state verification in e2e.
      await new Promise(() => {
        // Intentionally unresolved.
      });

      return new Response('', {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    };
  });
}

async function openAssistantModal(page: Page) {
  await expect(async () => {
    const openTrigger = page.locator('button[aria-label="Open assistant"]');
    await expect(openTrigger).toBeVisible();
    await openTrigger.click({ force: true });
    await expect(page.getByRole('heading', { name: 'AI Shopping Assistant' })).toBeVisible();
  }).toPass({
    timeout: 15_000,
  });
}

test('assistant FAB modal opens on customer route and dispatches stream request', async ({ page }) => {
  test.setTimeout(120_000);
  await mockCustomerSessionBootstrap(page);
  await installAssistantStreamCaptureMock(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await openAssistantModal(page);

  await expect(page.getByRole('button', { name: /attach/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /edit/i })).toHaveCount(0);
  await expect(page.getByText(/try: running shoes/i)).toHaveCount(0);

  await page.getByLabel('Assistant message').fill('Recommend running shoes under $100');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return (
          (window as Window & { __assistantCapturedBodies?: CapturedAssistantBody[] })
            .__assistantCapturedBodies?.length ?? 0
        );
      });
    })
    .toBe(1);

  await expect(page.getByRole('status')).toContainText('Thinking...');

  const capturedBodies = await page.evaluate(() => {
    return (
      (window as Window & { __assistantCapturedBodies?: CapturedAssistantBody[] })
        .__assistantCapturedBodies ?? []
    );
  });

  expect(capturedBodies[0]?.message).toBe('Recommend running shoes under $100');
  expect(capturedBodies[0]?.sessionId).toBeTruthy();
});

test('/assistant route returns 404 after modal migration', async ({ page }) => {
  const response = await page.goto('/assistant', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(404);
});
