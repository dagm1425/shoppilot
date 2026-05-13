import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import cookieParser from 'cookie-parser';
import { PasswordResetMailerService } from '../../src/auth/password-reset-mailer.service.js';
import { ApiErrorFilter } from '../../src/common/api-error.filter.js';
import { requestContextMiddleware } from '../../src/common/request-context.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export async function createTestApp(options?: {
  prismaService?: Partial<PrismaService>;
  passwordResetMailerService?: Partial<PasswordResetMailerService>;
}): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options?.prismaService) {
    builder.overrideProvider(PrismaService).useValue(options.prismaService);
  }

  if (options?.passwordResetMailerService) {
    builder
      .overrideProvider(PasswordResetMailerService)
      .useValue(options.passwordResetMailerService);
  }

  const testingModule = await builder.compile();

  const app = testingModule.createNestApplication();
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();

  return app;
}
