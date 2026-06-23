import { HttpException } from '@nestjs/common';
import {
  parseAiChatRequestOrThrow,
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
});
