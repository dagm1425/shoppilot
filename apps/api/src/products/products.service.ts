import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CatalogListQuery,
  CatalogListResponse,
  CatalogProductDetailsResponse,
} from '@shoppilot/db/catalog-contract';
import { ProductMediaRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  fromPrismaCategory,
  fromPrismaGender,
  mapCatalogPriceRangeToWhere,
  mapCatalogSortToOrderBy,
  normalizeCatalogSearchQuery,
  toPrismaCategory,
  toPrismaGender,
} from './products.query-utils.js';
import { ProductMediaStorageService } from './product-media-storage.service.js';
import type {
  AdminCreateProductInput,
  AdminMediaPresignInput,
  AdminProductMediaRole,
  AdminUpdateProductInput,
} from './products.schemas.js';

type AdminMediaPresignResponse = {
  role: AdminProductMediaRole;
  objectKey: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
  requiredHeaders: {
    'content-type': string;
  };
};

type AdminProductMutationResponse = {
  product: {
    productId: string;
    name: string;
    description: string;
    category: 'bottoms' | 'tops';
    gender: 'men' | 'women';
    fit: string;
    color: string;
    priceCents: number;
    currency: string;
    available: boolean;
    stock: number;
    primaryImageUrl: string;
    secondaryImageUrl: string | null;
    media: Array<{
      role: AdminProductMediaRole;
      objectKey: string;
      url: string;
      contentType: string;
      sizeBytes: number;
      altText: string | null;
    }>;
    createdAt: string;
    updatedAt: string;
  };
};

function slugifyFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length === 0) {
    return 'product';
  }

  if (slug.length <= 120) {
    return slug;
  }

  return slug.slice(0, 120).replace(/-+$/g, '');
}

function toAdminMediaRole(role: ProductMediaRole): AdminProductMediaRole {
  return role === ProductMediaRole.PRIMARY ? 'primary' : 'secondary';
}

function mapAdminProductMutationResponse(
  product: Prisma.ProductGetPayload<{
    include: {
      media: true;
    };
  }>,
): AdminProductMutationResponse {
  return {
    product: {
      productId: product.slug,
      name: product.name,
      description: product.description,
      category: fromPrismaCategory(product.category),
      gender: fromPrismaGender(product.gender),
      fit: product.fit,
      color: product.color,
      priceCents: product.priceCents,
      currency: product.currency,
      available: product.available,
      stock: product.stock,
      primaryImageUrl: product.primaryImageUrl,
      secondaryImageUrl: product.secondaryImageUrl,
      media: product.media
        .map((item) => ({
          role: toAdminMediaRole(item.role),
          objectKey: item.objectKey,
          url: item.url,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
          altText: item.altText,
        }))
        .sort((left, right) => left.role.localeCompare(right.role)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    },
  };
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProductMediaStorageService) private readonly mediaStorage: ProductMediaStorageService,
  ) {}

  async listProducts(query: CatalogListQuery, requestId?: string): Promise<CatalogListResponse> {
    const searchQuery = normalizeCatalogSearchQuery(query.q);
    const priceWhere = mapCatalogPriceRangeToWhere(query.price);
    const where: Prisma.ProductWhereInput = {
      ...(query.category
        ? {
            category: toPrismaCategory(query.category),
          }
        : {}),
      ...(query.gender
        ? {
            gender: toPrismaGender(query.gender),
          }
        : {}),
      ...(priceWhere ?? {}),
      ...(searchQuery
        ? {
            OR: [
              {
                name: {
                  contains: searchQuery,
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: searchQuery,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const orderBy = mapCatalogSortToOrderBy(query.sort, Boolean(searchQuery));

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy,
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);

    this.logger.log({
      event: 'catalog.list',
      requestId: requestId ?? 'unknown-request-id',
      outcome: 'success',
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      category: query.category,
      gender: query.gender,
      price: query.price,
      searchQueryLength: searchQuery?.length ?? 0,
      itemCount: products.length,
      total,
    });

    return {
      items: products.map((product) => ({
        productId: product.slug,
        name: product.name,
        category: fromPrismaCategory(product.category),
        gender: fromPrismaGender(product.gender),
        fit: product.fit,
        color: product.color,
        priceCents: product.priceCents,
        currency: product.currency,
        available: product.available,
        primaryImageUrl: product.primaryImageUrl,
        secondaryImageUrl: product.secondaryImageUrl,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
      },
      appliedFilters: {
        sort: query.sort,
        category: query.category,
        gender: query.gender,
        price: query.price,
        q: searchQuery,
      },
    };
  }

  async getProductById(productId: string, requestId?: string): Promise<CatalogProductDetailsResponse> {
    const product = await this.prisma.product.findUnique({
      where: { slug: productId },
    });

    if (!product) {
      throw new HttpException(
        {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log({
      event: 'catalog.detail',
      requestId: requestId ?? 'unknown-request-id',
      outcome: 'success',
      productId,
      available: product.available,
    });

    return {
      product: {
        productId: product.slug,
        name: product.name,
        description: product.description,
        category: fromPrismaCategory(product.category),
        gender: fromPrismaGender(product.gender),
        fit: product.fit,
        color: product.color,
        priceCents: product.priceCents,
        currency: product.currency,
        available: product.available,
        stock: product.stock,
        images: [product.primaryImageUrl, product.secondaryImageUrl].filter(
          (image): image is string => typeof image === 'string' && image.length > 0,
        ),
        createdAt: product.createdAt.toISOString(),
      },
    };
  }

  async createAdminMediaPresign(
    input: AdminMediaPresignInput,
    requestId?: string,
  ): Promise<AdminMediaPresignResponse> {
    return this.mediaStorage.createPresignedUpload(input, requestId);
  }

  async createProductAsAdmin(
    input: AdminCreateProductInput,
    requestId?: string,
  ): Promise<AdminProductMutationResponse> {
    const slug = input.slug ?? slugifyFromName(input.name);

    const existing = await this.prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new HttpException(
        {
          code: 'PRODUCT_SLUG_CONFLICT',
          message: 'A product with this slug already exists.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const product = await this.prisma.product.create({
      data: {
        slug,
        name: input.name,
        description: input.description,
        category: toPrismaCategory(input.category),
        gender: toPrismaGender(input.gender),
        fit: input.fit,
        color: input.color,
        priceCents: input.priceCents,
        stock: input.stock,
        available: input.available,
        primaryImageUrl: input.media.primary.url,
        secondaryImageUrl: input.media.secondary?.url ?? null,
        media: {
          // future: orphan-media-cleanup - uploads can be created before product commit in browser flow.
          create: [
            {
              role: ProductMediaRole.PRIMARY,
              objectKey: input.media.primary.objectKey,
              url: input.media.primary.url,
              contentType: input.media.primary.contentType,
              sizeBytes: input.media.primary.sizeBytes,
              altText: input.media.primary.altText,
            },
            ...(input.media.secondary
              ? [
                  {
                    role: ProductMediaRole.SECONDARY,
                    objectKey: input.media.secondary.objectKey,
                    url: input.media.secondary.url,
                    contentType: input.media.secondary.contentType,
                    sizeBytes: input.media.secondary.sizeBytes,
                    altText: input.media.secondary.altText,
                  },
                ]
              : []),
          ],
        },
      },
      include: {
        media: true,
      },
    });

    this.logger.log({
      event: 'admin.product.create',
      requestId: requestId ?? 'unknown-request-id',
      productId: product.id,
      productSlug: product.slug,
      outcome: 'success',
    });

    return mapAdminProductMutationResponse(product);
  }

  async updateProductAsAdmin(
    productId: string,
    input: AdminUpdateProductInput,
    requestId?: string,
  ): Promise<AdminProductMutationResponse> {
    const existing = await this.prisma.product.findUnique({
      where: {
        slug: productId,
      },
      include: {
        media: true,
      },
    });

    if (!existing) {
      throw new HttpException(
        {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const primaryMediaInput = input.media?.primary;
    const secondaryMediaInput = input.media?.secondary;
    const currentPrimaryMedia = existing.media.find((item) => item.role === ProductMediaRole.PRIMARY);
    const currentSecondaryMedia = existing.media.find((item) => item.role === ProductMediaRole.SECONDARY);

    const updateData: Prisma.ProductUpdateInput = {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.category ? { category: toPrismaCategory(input.category) } : {}),
      ...(input.gender ? { gender: toPrismaGender(input.gender) } : {}),
      ...(input.fit ? { fit: input.fit } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(typeof input.priceCents === 'number' ? { priceCents: input.priceCents } : {}),
      ...(typeof input.stock === 'number' ? { stock: input.stock } : {}),
      ...(typeof input.available === 'boolean' ? { available: input.available } : {}),
      ...(primaryMediaInput || secondaryMediaInput
        ? {
            primaryImageUrl:
              primaryMediaInput?.url ?? currentPrimaryMedia?.url ?? existing.primaryImageUrl,
            secondaryImageUrl:
              secondaryMediaInput?.url ?? currentSecondaryMedia?.url ?? existing.secondaryImageUrl,
          }
        : {}),
    };

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: {
          slug: productId,
        },
        data: updateData,
      });

      if (primaryMediaInput) {
        await tx.productMedia.upsert({
          where: {
            productId_role: {
              productId: existing.id,
              role: ProductMediaRole.PRIMARY,
            },
          },
          update: {
            objectKey: primaryMediaInput.objectKey,
            url: primaryMediaInput.url,
            contentType: primaryMediaInput.contentType,
            sizeBytes: primaryMediaInput.sizeBytes,
            altText: primaryMediaInput.altText,
          },
          create: {
            productId: existing.id,
            role: ProductMediaRole.PRIMARY,
            objectKey: primaryMediaInput.objectKey,
            url: primaryMediaInput.url,
            contentType: primaryMediaInput.contentType,
            sizeBytes: primaryMediaInput.sizeBytes,
            altText: primaryMediaInput.altText,
          },
        });
      }

      if (secondaryMediaInput) {
        await tx.productMedia.upsert({
          where: {
            productId_role: {
              productId: existing.id,
              role: ProductMediaRole.SECONDARY,
            },
          },
          update: {
            objectKey: secondaryMediaInput.objectKey,
            url: secondaryMediaInput.url,
            contentType: secondaryMediaInput.contentType,
            sizeBytes: secondaryMediaInput.sizeBytes,
            altText: secondaryMediaInput.altText,
          },
          create: {
            productId: existing.id,
            role: ProductMediaRole.SECONDARY,
            objectKey: secondaryMediaInput.objectKey,
            url: secondaryMediaInput.url,
            contentType: secondaryMediaInput.contentType,
            sizeBytes: secondaryMediaInput.sizeBytes,
            altText: secondaryMediaInput.altText,
          },
        });
      }

      return tx.product.findUniqueOrThrow({
        where: {
          id: updated.id,
        },
        include: {
          media: true,
        },
      });
    });

    this.logger.log({
      event: 'admin.product.update',
      requestId: requestId ?? 'unknown-request-id',
      productId: product.id,
      productSlug: product.slug,
      mediaPrimaryUpdated: Boolean(primaryMediaInput),
      mediaSecondaryUpdated: Boolean(secondaryMediaInput),
      outcome: 'success',
    });

    return mapAdminProductMutationResponse(product);
  }
}
