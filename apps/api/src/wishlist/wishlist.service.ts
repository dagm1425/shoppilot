import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AddWishlistItemInput,
  WishlistItem,
  WishlistResponse,
} from '@shoppilot/db/wishlist-contract';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

const wishlistWithItemsInclude = {
  items: {
    include: {
      product: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.WishlistInclude;

type WishlistWithItems = Prisma.WishlistGetPayload<{ include: typeof wishlistWithItemsInclude }>;

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getWishlist(user: AuthenticatedRequestUser, requestId?: string): Promise<WishlistResponse> {
    const wishlist = await this.getOrCreateWishlist(user.id);
    const response = this.mapWishlistResponse(wishlist);

    this.logger.log({
      event: 'wishlist.read',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  async addItem(
    user: AuthenticatedRequestUser,
    input: AddWishlistItemInput,
    requestId?: string,
  ): Promise<WishlistResponse> {
    const product = await this.prisma.product.findUnique({
      where: {
        slug: input.productId,
      },
    });

    if (!product) {
      throw new HttpException(
        {
          code: 'WISHLIST_PRODUCT_NOT_FOUND',
          message: 'Product not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const wishlist = await this.getOrCreateWishlist(user.id);

    const existingItem = wishlist.items.find((item) => item.productId === product.id);

    if (!existingItem) {
      await this.prisma.wishlistItem.create({
        data: {
          wishlistId: wishlist.id,
          productId: product.id,
        },
      });
    }

    const updatedWishlist = await this.getOrCreateWishlist(user.id);
    const response = this.mapWishlistResponse(updatedWishlist);

    this.logger.log({
      event: 'wishlist.add',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      productId: input.productId,
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  async removeItem(
    user: AuthenticatedRequestUser,
    itemId: string,
    requestId?: string,
  ): Promise<WishlistResponse> {
    await this.prisma.wishlistItem.deleteMany({
      where: {
        id: itemId,
        wishlist: {
          userId: user.id,
        },
      },
    });

    const updatedWishlist = await this.getOrCreateWishlist(user.id);
    const response = this.mapWishlistResponse(updatedWishlist);

    this.logger.log({
      event: 'wishlist.remove',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      itemId,
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  private async getOrCreateWishlist(userId: string): Promise<WishlistWithItems> {
    return this.prisma.wishlist.upsert({
      where: {
        userId,
      },
      create: {
        userId,
      },
      update: {},
      include: wishlistWithItemsInclude,
    });
  }

  private mapWishlistResponse(wishlist: WishlistWithItems): WishlistResponse {
    const items: WishlistItem[] = wishlist.items.map((item) => ({
      itemId: item.id,
      productId: item.product.slug,
      name: item.product.name,
      fit: item.product.fit,
      color: item.product.color,
      available: item.product.available,
      stock: item.product.stock,
      priceCents: item.product.priceCents,
      currency: item.product.currency,
      primaryImageUrl: item.product.primaryImageUrl,
      secondaryImageUrl: item.product.secondaryImageUrl,
    }));

    return {
      items,
      summary: {
        itemCount: items.length,
      },
    };
  }
}
