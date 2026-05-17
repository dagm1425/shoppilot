import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseEnv } from '../config/env.js';
import type { AdminMediaPresignInput, AdminProductMediaRole } from './products.schemas.js';
import { productMediaContentTypeValues } from './products.types.js';

type PresignedUploadTarget = {
  role: AdminProductMediaRole;
  objectKey: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
  requiredHeaders: {
    'content-type': string;
  };
};

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized.length > 0 ? sanitized : 'upload.bin';
}

function joinUrlPath(base: string, objectKey: string): string {
  return `${base.replace(/\/$/, '')}/${objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

@Injectable()
export class ProductMediaStorageService {
  private readonly logger = new Logger(ProductMediaStorageService.name);
  private readonly env = parseEnv(process.env);
  private readonly s3Client =
    this.env.PRODUCT_MEDIA_S3_BUCKET && this.env.PRODUCT_MEDIA_S3_REGION
      ? new S3Client({ region: this.env.PRODUCT_MEDIA_S3_REGION })
      : null;

  async createPresignedUpload(
    input: AdminMediaPresignInput,
    requestId?: string,
  ): Promise<PresignedUploadTarget> {
    if (!this.s3Client || !this.env.PRODUCT_MEDIA_S3_BUCKET || !this.env.PRODUCT_MEDIA_S3_REGION) {
      throw new HttpException(
        {
          code: 'PRODUCT_MEDIA_NOT_CONFIGURED',
          message: 'Product media upload is not configured.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!productMediaContentTypeValues.includes(input.contentType)) {
      throw new HttpException(
        {
          code: 'PRODUCT_MEDIA_CONTENT_TYPE_UNSUPPORTED',
          message: 'Unsupported media content type.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (input.sizeBytes > this.env.PRODUCT_MEDIA_MAX_UPLOAD_BYTES) {
      throw new HttpException(
        {
          code: 'PRODUCT_MEDIA_TOO_LARGE',
          message: `Media file exceeds max size of ${this.env.PRODUCT_MEDIA_MAX_UPLOAD_BYTES} bytes.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const objectKey = `${this.env.PRODUCT_MEDIA_OBJECT_PREFIX}/${year}/${month}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: this.env.PRODUCT_MEDIA_S3_BUCKET,
      Key: objectKey,
      // future: media-derivatives - keep original upload untouched for later resize/webp pipeline.
      ContentType: input.contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, uploadCommand, {
      expiresIn: this.env.PRODUCT_MEDIA_PRESIGN_TTL_SECONDS,
      signableHeaders: new Set(['content-type']),
    });

    // future: CDN-domain-switch - keep object key for URL remapping without schema rewrites.
    const publicUrl = this.env.PRODUCT_MEDIA_PUBLIC_BASE_URL
      ? joinUrlPath(this.env.PRODUCT_MEDIA_PUBLIC_BASE_URL, objectKey)
      : joinUrlPath(
          `https://${this.env.PRODUCT_MEDIA_S3_BUCKET}.s3.${this.env.PRODUCT_MEDIA_S3_REGION}.amazonaws.com`,
          objectKey,
        );

    this.logger.log({
      event: 'admin.product.media.presign',
      requestId: requestId ?? 'unknown-request-id',
      role: input.role,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      objectKey,
      outcome: 'success',
    });

    return {
      role: input.role,
      objectKey,
      uploadUrl,
      publicUrl,
      expiresInSeconds: this.env.PRODUCT_MEDIA_PRESIGN_TTL_SECONDS,
      requiredHeaders: {
        'content-type': input.contentType,
      },
    };
  }
}
