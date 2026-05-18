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

const aiProductItemSchema = z
  .object({
    productId: nonEmptyString,
    name: nonEmptyString,
    category: nonEmptyString,
    priceCents: z.number().int().nonnegative(),
    currency: z.string().trim().length(3),
    available: z.boolean(),
    rating: z.number().min(0).max(5).nullable().optional(),
    shortDescription: z.string().trim().nullable().optional(),
  })
  .strict();

const aiFinalRecommendationSchema = z
  .object({
    summary: nonEmptyString,
    recommendedProducts: z.array(aiProductItemSchema).default([]),
    comparisonSummary: z.string().trim().nullable().optional(),
    followUpPrompts: z.array(nonEmptyString).default([]),
  })
  .strict();

export const aiChatResponseSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    assistantMessage: nonEmptyString,
    recommendations: z.array(aiFinalRecommendationSchema).default([]),
    recommendedProductIds: z.array(nonEmptyString).default([]),
    retrievalMode: z.enum(['structured', 'semantic', 'hybrid']).nullable().optional(),
    followUpPrompts: z.array(nonEmptyString).default([]),
    model: z.string().trim().nullable().optional(),
    placeholder: z.boolean(),
  })
  .strict();

export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiUpstreamChatRequest = z.infer<typeof aiUpstreamChatRequestSchema>;
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

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

export function parseAiUpstreamResponseOrThrow(input: unknown): AiChatResponse {
  const parsed = aiChatResponseSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'AI_UPSTREAM_RESPONSE_INVALID',
      message: 'Assistant service returned an invalid response.',
    },
    HttpStatus.BAD_GATEWAY,
  );
}
