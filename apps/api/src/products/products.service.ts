import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CatalogListQuery,
  CatalogListResponse,
  CatalogProductDetailsResponse,
} from '@shoppilot/db/catalog-contract';
import type { Prisma } from '@prisma/client';
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

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
