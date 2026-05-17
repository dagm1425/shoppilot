import { z } from 'zod';

export const adminProductCategoryValues = ['bottoms', 'tops'] as const;
export const adminProductGenderValues = ['men', 'women'] as const;
export const adminProductMediaRoleValues = ['primary', 'secondary'] as const;
export const adminProductMediaContentTypeValues = ['image/jpeg', 'image/png', 'image/webp'] as const;

const productSlugSchema = z
  .string()
  .trim()
  .min(1, 'Product slug is required.')
  .max(120, 'Product slug is too long.')
  .regex(/^[a-z0-9-]+$/, 'Product slug can include lowercase letters, numbers, and hyphens only.');

const productNameSchema = z
  .string()
  .trim()
  .min(2, 'Product name must be at least 2 characters.')
  .max(160, 'Product name is too long.');

const productDescriptionSchema = z
  .string()
  .trim()
  .min(8, 'Description must be at least 8 characters.')
  .max(2000, 'Description is too long.');

const productTextSchema = z
  .string()
  .trim()
  .min(1, 'This field is required.')
  .max(160, 'This value is too long.');

const mediaMetadataSchema = z.object({
  objectKey: z.string().trim().min(3),
  url: z.string().url(),
  contentType: z.enum(adminProductMediaContentTypeValues),
  sizeBytes: z.number().int().positive(),
  altText: z
    .string()
    .trim()
    .max(180, 'Alt text is too long.')
    .optional(),
});

export const adminMediaPresignRequestSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required.'),
  contentType: z.enum(adminProductMediaContentTypeValues),
  sizeBytes: z.number().int().positive(),
  role: z.enum(adminProductMediaRoleValues),
});

export const adminCreateProductSchema = z.object({
  slug: productSlugSchema.optional(),
  name: productNameSchema,
  description: productDescriptionSchema,
  category: z.enum(adminProductCategoryValues),
  gender: z.enum(adminProductGenderValues),
  fit: productTextSchema,
  color: productTextSchema,
  priceCents: z.number().int().min(0, 'Price must be non-negative.'),
  stock: z.number().int().min(0, 'Stock must be non-negative.'),
  available: z.boolean(),
  media: z.object({
    primary: mediaMetadataSchema,
    secondary: mediaMetadataSchema.optional(),
  }),
});

export const adminUpdateProductSchema = z
  .object({
    name: productNameSchema.optional(),
    description: productDescriptionSchema.optional(),
    category: z.enum(adminProductCategoryValues).optional(),
    gender: z.enum(adminProductGenderValues).optional(),
    fit: productTextSchema.optional(),
    color: productTextSchema.optional(),
    priceCents: z.number().int().min(0, 'Price must be non-negative.').optional(),
    stock: z.number().int().min(0, 'Stock must be non-negative.').optional(),
    available: z.boolean().optional(),
    media: z
      .object({
        primary: mediaMetadataSchema.optional(),
        secondary: mediaMetadataSchema.optional(),
      })
      .optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Provide at least one field to update.',
  });

export const adminProductIdLookupSchema = productSlugSchema;

export type AdminCreateProductInput = z.infer<typeof adminCreateProductSchema>;
export type AdminUpdateProductInput = z.infer<typeof adminUpdateProductSchema>;
export type AdminMediaPresignRequestInput = z.infer<typeof adminMediaPresignRequestSchema>;
export type AdminProductMediaMetadata = z.infer<typeof mediaMetadataSchema>;
export type AdminProductMediaRole = z.infer<typeof adminMediaPresignRequestSchema>['role'];
