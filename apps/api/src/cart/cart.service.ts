import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AddCartItemInput,
  CartProductSize,
  CartLineItem,
  CartResponse,
  UpdateCartItemInput,
} from '@shoppilot/db/cart-contract';
import { ProductSize, type Prisma } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildCartSummary, evaluateCartLine } from './cart.policy.js';

const cartWithItemsInclude = {
  items: {
    include: {
      product: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartWithItemsInclude }>;

function toPrismaSize(size: CartProductSize): ProductSize {
  switch (size) {
    case 's':
      return ProductSize.S;
    case 'm':
      return ProductSize.M;
    case 'l':
      return ProductSize.L;
    case 'xl':
      return ProductSize.XL;
    default:
      return ProductSize.M;
  }
}

function fromPrismaSize(size: ProductSize): CartProductSize {
  switch (size) {
    case ProductSize.S:
      return 's';
    case ProductSize.L:
      return 'l';
    case ProductSize.XL:
      return 'xl';
    case ProductSize.M:
    default:
      return 'm';
  }
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCart(user: AuthenticatedRequestUser, requestId?: string): Promise<CartResponse> {
    const cart = await this.getOrCreateCart(user.id);
    const response = this.mapCartResponse(cart);

    this.logger.log({
      event: 'cart.read',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      itemCount: response.summary.itemCount,
      validLineCount: response.summary.validLineCount,
      subtotalCents: response.summary.subtotalCents,
    });

    return response;
  }

  async addItem(
    user: AuthenticatedRequestUser,
    input: AddCartItemInput,
    requestId?: string,
  ): Promise<CartResponse> {
    const product = await this.prisma.product.findUnique({
      where: {
        slug: input.productId,
      },
    });

    if (!product) {
      throw new HttpException(
        {
          code: 'CART_PRODUCT_NOT_FOUND',
          message: 'Product not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!product.available || product.stock < 1) {
      throw new HttpException(
        {
          code: 'CART_PRODUCT_UNAVAILABLE',
          message: 'This product is currently unavailable.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const cart = await this.getOrCreateCart(user.id);

    const size = toPrismaSize(input.size);
    const existingItem = cart.items.find(
      (item) => item.productId === product.id && item.size === size,
    );
    const nextQuantity = (existingItem?.quantity ?? 0) + input.quantity;

    if (nextQuantity > product.stock) {
      throw new HttpException(
        {
          code: 'CART_STOCK_EXCEEDED',
          message: `Only ${product.stock} unit(s) are available.`,
        },
        HttpStatus.CONFLICT,
      );
    }

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          quantity: nextQuantity,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          size,
          quantity: input.quantity,
        },
      });
    }

    const updatedCart = await this.getOrCreateCart(user.id);
    const response = this.mapCartResponse(updatedCart);

    this.logger.log({
      event: 'cart.add',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      productId: input.productId,
      size: input.size,
      quantity: input.quantity,
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  async updateItem(
    user: AuthenticatedRequestUser,
    itemId: string,
    input: UpdateCartItemInput,
    requestId?: string,
  ): Promise<CartResponse> {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: {
          userId: user.id,
        },
      },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new HttpException(
        {
          code: 'CART_ITEM_NOT_FOUND',
          message: 'Cart item not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!cartItem.product.available || cartItem.product.stock < 1) {
      throw new HttpException(
        {
          code: 'CART_PRODUCT_UNAVAILABLE',
          message: 'This product is currently unavailable.',
        },
        HttpStatus.CONFLICT,
      );
    }

    if (input.quantity > cartItem.product.stock) {
      throw new HttpException(
        {
          code: 'CART_STOCK_EXCEEDED',
          message: `Only ${cartItem.product.stock} unit(s) are available.`,
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.cartItem.update({
      where: {
        id: itemId,
      },
      data: {
        quantity: input.quantity,
      },
    });

    const updatedCart = await this.getOrCreateCart(user.id);
    const response = this.mapCartResponse(updatedCart);

    this.logger.log({
      event: 'cart.update',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      itemId,
      quantity: input.quantity,
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  async removeItem(
    user: AuthenticatedRequestUser,
    itemId: string,
    requestId?: string,
  ): Promise<CartResponse> {
    await this.prisma.cartItem.deleteMany({
      where: {
        id: itemId,
        cart: {
          userId: user.id,
        },
      },
    });

    const updatedCart = await this.getOrCreateCart(user.id);
    const response = this.mapCartResponse(updatedCart);

    this.logger.log({
      event: 'cart.remove',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      itemId,
      itemCount: response.summary.itemCount,
    });

    return response;
  }

  private async getOrCreateCart(userId: string): Promise<CartWithItems> {
    // future: guest cart merge - authenticated-only cart in Phase 1; merge policy deferred.
    return this.prisma.cart.upsert({
      where: {
        userId,
      },
      create: {
        userId,
      },
      update: {},
      include: cartWithItemsInclude,
    });
  }

  private mapCartResponse(cart: CartWithItems): CartResponse {
    const items: CartLineItem[] = cart.items.map((item) => {
      const lineState = evaluateCartLine({
        quantity: item.quantity,
        available: item.product.available,
        stock: item.product.stock,
        unitPriceCents: item.product.priceCents,
      });

      return {
        itemId: item.id,
        productId: item.product.slug,
        name: item.product.name,
        fit: item.product.fit,
        color: item.product.color,
        size: fromPrismaSize(item.size),
        quantity: item.quantity,
        stock: item.product.stock,
        available: item.product.available,
        priceCents: item.product.priceCents,
        currency: item.product.currency,
        primaryImageUrl: item.product.primaryImageUrl,
        secondaryImageUrl: item.product.secondaryImageUrl,
        isValid: lineState.isValid,
        invalidReason: lineState.invalidReason,
        lineSubtotalCents: lineState.lineSubtotalCents,
      };
    });

    const summary = buildCartSummary(items);

    return {
      items,
      summary,
    };
  }
}
