import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { RequestWithContext } from '../common/request-context.js';
import { parseEnv } from '../config/env.js';
import { parseAiChatRequestOrThrow } from './ai.schemas.js';
import { AiService } from './ai.service.js';
import { AiThrottlerGuard } from './ai-throttler.guard.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';

const env = parseEnv(process.env);

@Controller('ai')
export class AiController {
  constructor(@Inject(AiService) private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(OptionalJwtAuthGuard, AiThrottlerGuard)
  @Throttle({
    default: {
      limit: env.AI_RATE_LIMIT_MAX,
      ttl: env.AI_RATE_LIMIT_TTL_SEC * 1_000,
    },
  })
  async chat(@Body() body: unknown, @Req() request: RequestWithContext) {
    const input = parseAiChatRequestOrThrow(body);

    Sentry.setTag('flow', 'ai_assistant');
    if (request.requestId) {
      Sentry.setTag('request_id', request.requestId);
    }

    return Sentry.startSpan(
      {
        name: 'ai.gateway.chat',
        op: 'http.server',
      },
      async () => this.aiService.chat(input, request),
    );
  }

  @Post('chat/stream')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard, AiThrottlerGuard)
  @Throttle({
    default: {
      limit: env.AI_RATE_LIMIT_MAX,
      ttl: env.AI_RATE_LIMIT_TTL_SEC * 1_000,
    },
  })
  async streamChat(
    @Body() body: unknown,
    @Req() request: RequestWithContext,
    @Res() response: Response,
  ) {
    const input = parseAiChatRequestOrThrow(body);

    Sentry.setTag('flow', 'ai_assistant');
    Sentry.setTag('transport', 'sse');
    if (request.requestId) {
      Sentry.setTag('request_id', request.requestId);
    }

    await Sentry.startSpan(
      {
        name: 'ai.gateway.chat.stream',
        op: 'http.server',
      },
      async () => this.aiService.chatStream(input, request, response),
    );
  }
}
