import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /health (integration)', () => {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();

    if (typeof address !== 'object' || !address?.port) {
      throw new Error('Failed to bind integration server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns service readiness payload', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const payload = (await response.json()) as {
      status: string;
      service: string;
      database: 'ok' | 'skipped';
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('api');
    expect(payload.database).toBe('skipped');
    expect(new Date(payload.timestamp).toString()).not.toBe('Invalid Date');
  });
});
