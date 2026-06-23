import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

const aiChatRequestContextSchema = z
  .object({
    locale: z.string().trim().min(2).max(35).optional(),
  })
  .strict();

export const aiChatRequestSchema = z
  .object({
    message: nonEmptyString.min(1, 'Message is required.'),
    sessionId: nonEmptyString.min(1, 'Session ID is required.'),
    userContext: aiChatRequestContextSchema.optional(),
  })
  .strict();

const aiUpstreamUserContextSchema = z
  .object({
    userId: nonEmptyString,
    locale: z.string().trim().min(2).max(35).optional(),
    authScope: nonEmptyString.optional(),
  })
  .strict();

export const aiUpstreamChatRequestSchema = z
  .object({
    message: nonEmptyString,
    sessionId: nonEmptyString,
    requestId: nonEmptyString,
    userContext: aiUpstreamUserContextSchema,
  })
  .strict();

export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiUpstreamChatRequest = z.infer<typeof aiUpstreamChatRequestSchema>;

function formatValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}

export function parseAiChatRequestOrThrow(input: unknown): AiChatRequest {
  const parsed = aiChatRequestSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'AI_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}
