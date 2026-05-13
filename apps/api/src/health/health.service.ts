import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async getHealth(checkDb: boolean) {
    let database: 'ok' | 'skipped' = 'skipped';

    if (checkDb) {
      await this.db.$queryRaw`SELECT 1`;
      database = 'ok';
    }

    return {
      status: 'ok',
      service: 'api',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
