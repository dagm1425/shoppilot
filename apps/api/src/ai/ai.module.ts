import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiThrottlerGuard } from './ai-throttler.guard.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, AiThrottlerGuard, OptionalJwtAuthGuard],
})
export class AiModule {}
