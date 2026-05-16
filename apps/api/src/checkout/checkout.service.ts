import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CartItemInvalidReason,
  CartLineItem,
  CartSummary,
} from '@shoppilot/db/cart-contract';
import type {
  CheckoutBlockingReason,
  CheckoutCartSnapshot,
  CheckoutSessionResponse,
  SelectCheckoutAddressInput,
  UpdateCheckoutContactInput,
} from '@shoppilot/db/checkout-contract';
import type { Prisma } from '@prisma/client';
import { evaluateCartLine, buildCartSummary } from '../cart/cart.policy.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { parseEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

const checkoutSessionInclude = {
  selectedAddress: true,
} satisfies Prisma.CheckoutSessionInclude;

type CheckoutSessionWithAddress = Prisma.CheckoutSessionGetPayload<{
  include: typeof checkoutSessionInclude;
}>;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly env = parseEnv(process.env);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async startSession(
    user: AuthenticatedRequestUser,
    requestId?: string,
  ): Promise<CheckoutSessionResponse> {
    const cart = await this.getOrCreateCart(user.id);
    const cartSnapshot = this.mapCartSnapshot(cart);

    this.assertCartIsCheckoutReady(cartSnapshot);

    const now = new Date();
    const defaultAddress = await this.prisma.address.findFirst({
      where: {
        userId: user.id,
        isDefault: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const activeSession = await this.prisma.checkoutSession.findFirst({
      where: {
        userId: user.id,
        cartId: cart.id,
        isActive: true,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: checkoutSessionInclude,
    });

    const selectedAddressId = activeSession?.selectedAddressId ?? defaultAddress?.id ?? null;

    if (activeSession) {
      const blockingReasons = this.resolveBlockingReasons(
        selectedAddressId,
        activeSession.contactEmail,
        activeSession.contactPhone,
      );

      const updated = await this.prisma.checkoutSession.update({
        where: {
          id: activeSession.id,
        },
        data: {
          selectedAddressId,
          cartSnapshot: cartSnapshot as unknown as Prisma.InputJsonValue,
          blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
          priceValidatedAt: now,
        },
        include: checkoutSessionInclude,
      });

      this.logSessionEvent('checkout.session.resume', user.id, requestId, blockingReasons);
      return this.mapSessionResponse(updated);
    }

    const contactEmail = user.email;
    const contactPhone = null;
    const blockingReasons = this.resolveBlockingReasons(selectedAddressId, contactEmail, contactPhone);

    const expiresAt = new Date(now.getTime() + this.env.CHECKOUT_SESSION_TTL_MINUTES * 60_000);

    const created = await this.prisma.$transaction(async (transaction) => {
      await transaction.checkoutSession.updateMany({
        where: {
          userId: user.id,
          cartId: cart.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return transaction.checkoutSession.create({
        data: {
          token: this.generateSessionToken(),
          userId: user.id,
          cartId: cart.id,
          selectedAddressId,
          contactEmail,
          contactPhone,
          cartSnapshot: cartSnapshot as unknown as Prisma.InputJsonValue,
          blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
          priceValidatedAt: now,
          expiresAt,
          isActive: true,
        },
        include: checkoutSessionInclude,
      });
    });

    this.logSessionEvent('checkout.session.create', user.id, requestId, blockingReasons);
    return this.mapSessionResponse(created);
  }

  async getSession(
    user: AuthenticatedRequestUser,
    token: string,
    requestId?: string,
  ): Promise<CheckoutSessionResponse> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: {
        token,
        userId: user.id,
      },
      include: checkoutSessionInclude,
    });

    if (!session) {
      throw new HttpException(
        {
          code: 'CHECKOUT_SESSION_NOT_FOUND',
          message: 'Checkout session not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    this.assertSessionIsActive(session);

    const selectedAddressId = session.selectedAddressId;
    const blockingReasons = this.resolveBlockingReasons(
      selectedAddressId,
      session.contactEmail,
      session.contactPhone,
    );

    const updated = await this.prisma.checkoutSession.update({
      where: {
        id: session.id,
      },
      data: {
        selectedAddressId,
        blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
      },
      include: checkoutSessionInclude,
    });

    this.logSessionEvent('checkout.session.read', user.id, requestId, blockingReasons);
    return this.mapSessionResponse(updated);
  }

  async selectAddress(
    user: AuthenticatedRequestUser,
    token: string,
    input: SelectCheckoutAddressInput,
    requestId?: string,
  ): Promise<CheckoutSessionResponse> {
    const session = await this.findSessionOrThrow(token, user.id);
    this.assertSessionIsActive(session);

    const address = await this.prisma.address.findFirst({
      where: {
        id: input.addressId,
        userId: user.id,
      },
    });

    if (!address) {
      throw new HttpException(
        {
          code: 'CHECKOUT_ADDRESS_NOT_FOUND',
          message: 'Address not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const blockingReasons = this.resolveBlockingReasons(
      address.id,
      session.contactEmail,
      session.contactPhone,
    );

    const updated = await this.prisma.checkoutSession.update({
      where: {
        id: session.id,
      },
      data: {
        selectedAddressId: address.id,
        blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
      },
      include: checkoutSessionInclude,
    });

    this.logSessionEvent('checkout.session.set-address', user.id, requestId, blockingReasons);
    return this.mapSessionResponse(updated);
  }

  async updateContact(
    user: AuthenticatedRequestUser,
    token: string,
    input: UpdateCheckoutContactInput,
    requestId?: string,
  ): Promise<CheckoutSessionResponse> {
    const session = await this.findSessionOrThrow(token, user.id);
    this.assertSessionIsActive(session);

    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedPhone = input.phone.trim();

    const blockingReasons = this.resolveBlockingReasons(
      session.selectedAddressId,
      normalizedEmail,
      normalizedPhone,
    );

    const updated = await this.prisma.checkoutSession.update({
      where: {
        id: session.id,
      },
      data: {
        contactEmail: normalizedEmail,
        contactPhone: normalizedPhone,
        blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
      },
      include: checkoutSessionInclude,
    });

    this.logSessionEvent('checkout.session.set-contact', user.id, requestId, blockingReasons);
    return this.mapSessionResponse(updated);
  }

  private resolveBlockingReasons(
    selectedAddressId: string | null,
    contactEmail: string | null,
    contactPhone: string | null,
  ): CheckoutBlockingReason[] {
    const reasons: CheckoutBlockingReason[] = [];

    if (!selectedAddressId) {
      reasons.push({
        code: 'ADDRESS_REQUIRED',
        message: 'Select or add a shipping address to continue.',
      });
    }

    if (!contactEmail || !contactPhone) {
      reasons.push({
        code: 'CONTACT_REQUIRED',
        message: 'Provide checkout contact email and phone to continue.',
      });
    }

    return reasons;
  }

  private assertCartIsCheckoutReady(snapshot: CheckoutCartSnapshot): void {
    if (snapshot.items.length === 0) {
      throw new HttpException(
        {
          code: 'CHECKOUT_CART_EMPTY',
          message: 'Your cart is empty. Add items before checkout.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const invalidReasons = snapshot.items
      .filter((item) => !item.isValid)
      .map((item) => item.invalidReason)
      .filter((reason): reason is CartItemInvalidReason => Boolean(reason));

    if (invalidReasons.includes('PRODUCT_UNAVAILABLE')) {
      throw new HttpException(
        {
          code: 'CHECKOUT_CART_ITEM_UNAVAILABLE',
          message: 'Some cart items are currently unavailable. Update your cart and retry.',
        },
        HttpStatus.CONFLICT,
      );
    }

    if (invalidReasons.includes('INSUFFICIENT_STOCK')) {
      throw new HttpException(
        {
          code: 'CHECKOUT_CART_STOCK_INVALID',
          message: 'Some cart quantities exceed current stock. Update your cart and retry.',
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private async getOrCreateCart(userId: string): Promise<CartWithItems> {
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

  private mapCartSnapshot(cart: CartWithItems): CheckoutCartSnapshot {
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
        size: item.size.toLowerCase() as CartLineItem['size'],
        quantity: item.quantity,
        stock: item.product.stock,
        available: item.product.available,
        priceCents: item.product.priceCents,
        currency: item.product.currency,
        primaryImageUrl: item.product.primaryImageUrl,
        secondaryImageUrl: item.product.secondaryImageUrl,
        isValid: lineState.isValid,
        invalidReason: lineState.invalidReason,
        // future: shipping-tax-totals - attach computed totals in subphase 2.2
        lineSubtotalCents: lineState.lineSubtotalCents,
      };
    });

    const summary: CartSummary = buildCartSummary(items);

    return {
      items,
      summary,
    };
  }

  private mapSessionResponse(session: CheckoutSessionWithAddress): CheckoutSessionResponse {
    const parsedBlockingReasons = Array.isArray(session.blockingReasons)
      ? (session.blockingReasons as CheckoutBlockingReason[])
      : [];

    const snapshot = session.cartSnapshot as CheckoutCartSnapshot;

    return {
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
      readinessStatus: parsedBlockingReasons.length > 0 ? 'blocked' : 'ready',
      blockingReasons: parsedBlockingReasons,
      selectedAddressId: session.selectedAddressId,
      contact: {
        email: session.contactEmail,
        phone: session.contactPhone,
      },
      // future: payment-hosted-checkout - attach provider session reference in subphase 2.2
      cartSnapshot: snapshot,
      priceValidatedAt: session.priceValidatedAt.toISOString(),
    };
  }

  private async findSessionOrThrow(token: string, userId: string): Promise<CheckoutSessionWithAddress> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: {
        token,
        userId,
      },
      include: checkoutSessionInclude,
    });

    if (!session) {
      throw new HttpException(
        {
          code: 'CHECKOUT_SESSION_NOT_FOUND',
          message: 'Checkout session not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return session;
  }

  private assertSessionIsActive(session: CheckoutSessionWithAddress): void {
    if (!session.isActive || session.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        {
          code: 'CHECKOUT_SESSION_EXPIRED',
          message: 'Checkout session expired. Restart checkout from cart.',
        },
        HttpStatus.GONE,
      );
    }
  }

  private generateSessionToken(): string {
    return randomBytes(24).toString('hex');
  }

  private logSessionEvent(
    event: string,
    userId: string,
    requestId: string | undefined,
    blockingReasons: CheckoutBlockingReason[],
  ): void {
    this.logger.log({
      event,
      userId,
      requestId: requestId ?? 'unknown-request-id',
      outcome: blockingReasons.length > 0 ? 'blocked' : 'ready',
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
    });
  }
}
