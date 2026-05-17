import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { RequestWithContext } from '../common/request-context.js';
import { parseEnv } from '../config/env.js';
import {
  parseAdminCreateProductBodyOrThrow,
  parseAdminMediaPresignBodyOrThrow,
  parseAdminUpdateProductBodyOrThrow,
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

  @Post('admin/media/presign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createAdminMediaPresign(@Body() body: unknown, @Req() request: RequestWithContext) {
    const parsedBody = parseAdminMediaPresignBodyOrThrow(body);

    Sentry.setTag('product.operation', 'admin-media-presign');
    Sentry.setTag('product.media.role', parsedBody.role);

    return Sentry.startSpan(
      {
        name: 'admin.product.media.presign',
        op: 'http.server',
      },
      async () => this.productsService.createAdminMediaPresign(parsedBody, request.requestId),
    );
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createProductAsAdmin(@Body() body: unknown, @Req() request: RequestWithContext) {
    const parsedBody = parseAdminCreateProductBodyOrThrow(body);

    Sentry.setTag('product.operation', 'admin-create');
    Sentry.setTag('product.category', parsedBody.category);
    Sentry.setTag('product.gender', parsedBody.gender);

    return Sentry.startSpan(
      {
        name: 'admin.product.create',
        op: 'http.server',
      },
      async () => this.productsService.createProductAsAdmin(parsedBody, request.requestId),
    );
  }

  @Patch('admin/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateProductAsAdmin(
    @Param('productId') productId: string,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const parsedProductId = parseCatalogProductIdOrThrow(productId);
    const parsedBody = parseAdminUpdateProductBodyOrThrow(body);

    Sentry.setTag('product.operation', 'admin-update');

    return Sentry.startSpan(
      {
        name: 'admin.product.update',
        op: 'http.server',
      },
      async () => this.productsService.updateProductAsAdmin(parsedProductId, parsedBody, request.requestId),
    );
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
