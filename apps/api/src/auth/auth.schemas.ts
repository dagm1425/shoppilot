import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .max(72, 'Password must be at most 72 characters long.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one number.');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email address is invalid.');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32, 'Reset token is invalid.'),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

function formatValidationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => issue.message)
    .join(', ');
}

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new HttpException(
    {
      code: 'AUTH_VALIDATION_ERROR',
      message: formatValidationMessage(parsed.error),
    },
    HttpStatus.BAD_REQUEST,
  );
}
