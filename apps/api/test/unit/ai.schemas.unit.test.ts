import { HttpException } from '@nestjs/common';
import {
  parseAiChatRequestOrThrow,
  parseAiUpstreamResponseOrThrow,
} from '../../src/ai/ai.schemas.js';

describe('AI schema contracts', () => {
  it('accepts valid assistant chat payloads', () => {
    const parsed = parseAiChatRequestOrThrow({
      message: '  Recommend shoes under $100  ',
      sessionId: ' session-1 ',
      userContext: {
        locale: 'en-US',
      },
    });

    expect(parsed.message).toBe('Recommend shoes under $100');
    expect(parsed.sessionId).toBe('session-1');
    expect(parsed.userContext?.locale).toBe('en-US');
  });

  it('rejects blank assistant chat payloads with typed validation error', () => {
    try {
      parseAiChatRequestOrThrow({
        message: '   ',
        sessionId: 'session-1',
      });
      throw new Error('Expected parseAiChatRequestOrThrow to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);

      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(400);
      expect(exception.getResponse()).toMatchObject({
        code: 'AI_VALIDATION_ERROR',
      });
    }
  });

  it('accepts valid upstream chat responses', () => {
    const parsed = parseAiUpstreamResponseOrThrow({
      requestId: 'request-1',
      sessionId: 'session-1',
      assistantMessage: 'Here are the best matches.',
      recommendations: [
        {
          summary: 'Top picks',
          recommendedProducts: [
            {
              productId: 'prod-1',
              name: 'Runner Pro',
              category: 'shoes',
              priceCents: 8900,
              currency: 'USD',
              available: true,
              rating: 4.7,
              shortDescription: 'Breathable trainer',
            },
          ],
          comparisonSummary: null,
          followUpPrompts: ['Show lower-price options'],
        },
      ],
      recommendedProductIds: ['prod-1'],
      retrievalMode: 'semantic',
      followUpPrompts: ['Show lower-price options'],
      model: 'gpt-4.1-mini',
      placeholder: false,
    });

    expect(parsed.assistantMessage).toBe('Here are the best matches.');
    expect(parsed.recommendedProductIds).toEqual(['prod-1']);
    expect(parsed.placeholder).toBe(false);
  });

  it('rejects malformed upstream responses with bad gateway mapping', () => {
    try {
      parseAiUpstreamResponseOrThrow({
        requestId: 'request-1',
        sessionId: 'session-1',
        assistantMessage: 'Response',
        recommendations: [],
        recommendedProductIds: [],
        followUpPrompts: [],
      });
      throw new Error('Expected parseAiUpstreamResponseOrThrow to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);

      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(502);
      expect(exception.getResponse()).toMatchObject({
        code: 'AI_UPSTREAM_RESPONSE_INVALID',
      });
    }
  });
});
