import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithContext = Request & {
  requestId?: string;
  user?: AuthenticatedRequestUser;
};

export function requestContextMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const headerValue = request.header(REQUEST_ID_HEADER);
  const requestId = headerValue?.trim() || randomUUID();

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
