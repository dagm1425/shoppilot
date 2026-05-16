import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RequestWithContext } from '../common/request-context.js';
import { parseEnv } from '../config/env.js';
import {
  parseCatalogListQueryOrThrow,
  parseCatalogProductIdOrThrow,
} from './products.schemas.js';
import { ProductsService } from './products.service.js';

const env = parseEnv(process.env);

@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly productsService: ProductsService) {}

  @Get('_debug/error')
  async debugSentryTrigger() {
    if (env.NODE_ENV === 'production') {
      return {
        ok: false,
        message: 'Not available in production.',
      };
    }

    throw new Error('SENTRY_CATALOG_TEST_ERROR');
  }

  @Get()
  async listProducts(@Query() query: unknown, @Req() request: RequestWithContext) {
    const parsedQuery = parseCatalogListQueryOrThrow(query);

    Sentry.setTag('catalog.sort', parsedQuery.sort);
    Sentry.setTag('catalog.category', parsedQuery.category ?? 'all');
    Sentry.setTag('catalog.gender', parsedQuery.gender ?? 'all');
    Sentry.setTag('catalog.price', parsedQuery.price ?? 'all');
    if (parsedQuery.q) {
      Sentry.setTag('catalog.search', 'active');
    }

    return Sentry.startSpan(
      {
        name: 'catalog.list',
        op: 'http.server',
      },
      async () => this.productsService.listProducts(parsedQuery, request.requestId),
    );
  }

  @Get(':productId')
  async getProductById(@Param('productId') productId: string, @Req() request: RequestWithContext) {
    const parsedProductId = parseCatalogProductIdOrThrow(productId);

    return Sentry.startSpan(
      {
        name: 'catalog.detail',
        op: 'http.server',
      },
      async () => this.productsService.getProductById(parsedProductId, request.requestId),
    );
  }
}
