import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ApiErrorFilter } from './common/api-error.filter.js';
import { parseEnv } from './config/env.js';
import { requestContextMiddleware } from './common/request-context.js';
import { initializeSentry } from './observability/sentry.js';

async function bootstrap() {
  const env = parseEnv(process.env);
  initializeSentry(env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new ApiErrorFilter());

  await app.listen(env.API_PORT);

  logger.log(`API ready on http://localhost:${env.API_PORT}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
