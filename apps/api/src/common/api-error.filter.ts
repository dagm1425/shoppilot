import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { REQUEST_ID_HEADER, type RequestWithContext } from './request-context.js';

type ErrorPayload = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const traceId =
      request.requestId ?? request.header(REQUEST_ID_HEADER) ?? 'unknown-trace-id';

    const safeMessage = this.getSafeMessage(exception, status);
    const code = this.getErrorCode(exception, status, request.url);

    this.logger.error({
      message: 'Request failed',
      phase: this.resolvePhase(request.url),
      requestId: traceId,
      userId: request.user?.id,
      method: request.method,
      path: request.url,
      status,
      code,
    });

    const payload: ErrorPayload = {
      error: {
        code,
        message: safeMessage,
        traceId,
      },
    };

    response.status(status).json(payload);
  }

  private getSafeMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }

        if (typeof message === 'string') {
          return message;
        }
      }
    }

    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred.'
      : 'Request failed.';
  }

  private getErrorCode(exception: unknown, status: number, path: string): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (response && typeof response === 'object' && 'code' in response) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string' && code.trim().length > 0) {
          return code;
        }
      }

      if (path.startsWith('/auth')) {
        if (status === HttpStatus.TOO_MANY_REQUESTS) {
          return 'AUTH_RATE_LIMITED';
        }

        if (status === HttpStatus.UNAUTHORIZED) {
          return 'AUTH_UNAUTHORIZED';
        }
      }

      if (path.startsWith('/cart') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      if (path.startsWith('/wishlist') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      if (path.startsWith('/checkout') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      if (path.startsWith('/orders') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      if (path.startsWith('/products/admin') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      if (path.startsWith('/me/addresses') && status === HttpStatus.UNAUTHORIZED) {
        return 'AUTH_UNAUTHORIZED';
      }

      return `HTTP_${status}`;
    }

    return 'INTERNAL_SERVER_ERROR';
  }

  private resolvePhase(path: string): string {
    if (path.startsWith('/products/admin')) {
      return 'phase-3.3';
    }

    if (path.startsWith('/auth')) {
      return 'phase-1.1';
    }

    if (path.startsWith('/products')) {
      return 'phase-1.3';
    }

    if (path.startsWith('/cart')) {
      return 'phase-1.4';
    }

    if (path.startsWith('/wishlist')) {
      return 'phase-1.4';
    }

    if (path.startsWith('/checkout') || path.startsWith('/me/addresses')) {
      if (path.startsWith('/checkout/place-order')) {
        return 'phase-2.3';
      }

      return 'phase-2.1';
    }

    if (path.startsWith('/orders')) {
      return 'phase-2.3';
    }

    if (path.startsWith('/webhooks')) {
      return 'phase-2.4';
    }

    return 'phase-0';
  }
}
