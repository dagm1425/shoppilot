import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { parseEnv } from '../config/env.js';
import { initializeSentry } from '../observability/sentry.js';

async function bootstrapWorker() {
  const env = parseEnv(process.env);
  initializeSentry(env);

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const logger = new Logger('WorkerBootstrap');

  // application context is initialized; BullMQ processors defined in modules should start
  await app.init();
  logger.log('Worker application context initialized; processors should be active.');

  // keep process alive
  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down worker...');
    await app.close();
    process.exit(0);
  });

  // Also handle uncaught exceptions to surface issues to CloudWatch / Sentry
  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandledRejection', reason });
  });
  process.on('uncaughtException', (err) => {
    logger.error({ event: 'uncaughtException', err });
    process.exit(1);
  });
}

bootstrapWorker().catch((err) => {
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});
