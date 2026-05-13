import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import cookieParser from 'cookie-parser';
import { ApiErrorFilter } from '../../src/common/api-error.filter.js';
import { requestContextMiddleware } from '../../src/common/request-context.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export async function createTestApp(options?: {
  prismaService?: Partial<PrismaService>;
}): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options?.prismaService) {
    builder.overrideProvider(PrismaService).useValue(options.prismaService);
  }

  const testingModule = await builder.compile();

  const app = testingModule.createNestApplication();
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();

  return app;
}
