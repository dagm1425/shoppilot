import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/test-app.js';

describe('API smoke (e2e)', () => {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();

    if (typeof address !== 'object' || !address?.port) {
      throw new Error('Failed to bind e2e server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the health endpoint for smoke checks', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.ok).toBe(true);
  });
});
