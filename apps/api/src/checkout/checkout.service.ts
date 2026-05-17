import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CartItemInvalidReason,
  CartLineItem,
  CartSummary,
} from '@shoppilot/db/cart-contract';
import type {
  CheckoutBlockingReason,
  CheckoutCartSnapshot,
  CheckoutPaymentStatus,
  CheckoutPaymentStatusResponse,
  CheckoutPricingBreakdown,
  CheckoutSessionResponse,
  CreateCheckoutPaymentSessionResponse,
  SelectCheckoutAddressInput,
  UpdateCheckoutContactInput,
} from '@shoppilot/db/checkout-contract';
import type { OrderStatus, PlaceOrderInput, PlaceOrderResponse } from '@shoppilot/db/order-contract';
import { OrderStatus as PrismaOrderStatus, type Prisma } from '@prisma/client';
import { evaluateCartLine, buildCartSummary } from '../cart/cart.policy.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { parseEnv } from '../config/env.js';
import { mapOrderRecord, orderWithItemsInclude, type OrderWithItems } from '../orders/orders.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeCheckoutProvider } from './stripe-checkout.provider.js';

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

const checkoutSessionForOrderInclude = {
  selectedAddress: true,
  cart: {
    include: {
      items: {
        include: {
          product: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  },
  order: {
    include: orderWithItemsInclude,
  },
} satisfies Prisma.CheckoutSessionInclude;

type CheckoutSessionForOrder = Prisma.CheckoutSessionGetPayload<{
  include: typeof checkoutSessionForOrderInclude;
}>;

type PaymentReconciliationSource = 'webhook' | 'return-flow';

type PaymentReconciliationOutcome =
  | 'missing_session'
  | 'waiting'
  | 'order_created'
  | 'order_replay'
  | 'terminal_no_order'
  | 'terminal_applied'
  | 'terminal_ignored';

export type PaymentReconciliationResult = {
  providerSessionId: string;
  checkoutSessionId: string | null;
  checkoutSessionToken: string | null;
  paymentStatus: CheckoutPaymentStatus;
  outcome: PaymentReconciliationOutcome;
  orderId: string | null;
  orderNumber: string | null;
};

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly env = parseEnv(process.env);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeCheckoutProvider) private readonly stripeCheckoutProvider: StripeCheckoutProvider,
  ) {}

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
      const pricing = this.computePricing(cartSnapshot.summary, activeSession.selectedAddress?.country ?? null);

      const updated = await this.prisma.checkoutSession.update({
        where: {
          id: activeSession.id,
        },
        data: {
          selectedAddressId,
          cartSnapshot: cartSnapshot as unknown as Prisma.InputJsonValue,
          blockingReasons: blockingReasons as unknown as Prisma.InputJsonValue,
          priceValidatedAt: now,
          pricingSnapshotId: this.buildPricingFingerprint(user.id, activeSession.token, pricing),
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
    const pricing = this.computePricing(cartSnapshot.summary, defaultAddress?.country ?? null);

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
          pricingSnapshotId: this.buildPricingFingerprint(user.id, 'pending', pricing),
          expiresAt,
          isActive: true,
        },
        include: checkoutSessionInclude,
      });
    });

    await this.prisma.checkoutSession.update({
      where: { id: created.id },
      data: {
        pricingSnapshotId: this.buildPricingFingerprint(user.id, created.token, pricing),
      },
    });

    this.logSessionEvent('checkout.session.create', user.id, requestId, blockingReasons);
    const refreshed = await this.findSessionOrThrow(created.token, user.id);
    return this.mapSessionResponse(refreshed);
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

  async createPaymentSession(
    user: AuthenticatedRequestUser,
    token: string,
    requestId?: string,
  ): Promise<CreateCheckoutPaymentSessionResponse> {
    const session = await this.findSessionOrThrow(token, user.id);
    this.assertSessionIsActive(session);

    const blockingReasons = this.resolveBlockingReasons(
      session.selectedAddressId,
      session.contactEmail,
      session.contactPhone,
    );

    if (blockingReasons.length > 0) {
      throw new HttpException(
        {
          code: 'CHECKOUT_NOT_READY',
          message: 'Complete required checkout details before payment.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const snapshot = session.cartSnapshot as CheckoutCartSnapshot;
    const pricing = this.computePricing(snapshot.summary, session.selectedAddress?.country ?? null);
    const pricingFingerprint = this.buildPricingFingerprint(user.id, session.token, pricing);

    if (session.paymentProviderSessionId) {
      const existingProviderSession = await this.stripeCheckoutProvider.retrieveSession(
        session.paymentProviderSessionId,
      );
      if (existingProviderSession.url && existingProviderSession.status === 'open') {
        return {
          sessionToken: session.token,
          provider: 'stripe',
          providerSessionId: existingProviderSession.id,
          checkoutUrl: existingProviderSession.url,
        };
      }
    }

    const successUrl =
      this.env.STRIPE_WEB_SUCCESS_URL
      ?? `${this.env.WEB_ORIGIN}/checkout/payment-return?sessionToken=${encodeURIComponent(session.token)}&providerSessionId={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      this.env.STRIPE_WEB_CANCEL_URL
      ?? `${this.env.WEB_ORIGIN}/checkout/payment-return?sessionToken=${encodeURIComponent(session.token)}&providerSessionId={CHECKOUT_SESSION_ID}&status=canceled`;

    const providerSession = await this.stripeCheckoutProvider.createHostedSession({
      sessionToken: session.token,
      userId: user.id,
      customerEmail: session.contactEmail,
      subtotalCents: pricing.subtotalCents,
      shippingCents: pricing.shippingCents,
      taxCents: pricing.taxCents,
      successUrl,
      cancelUrl,
      idempotencyKey: `${session.token}:${pricingFingerprint}:${user.id}`,
    });

    await this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        paymentProviderSessionId: providerSession.id,
        pricingSnapshotId: pricingFingerprint,
      },
    });

    this.logger.log({
      event: 'checkout.session.create-payment',
      userId: user.id,
      requestId: requestId ?? 'unknown-request-id',
      outcome: 'success',
      provider: 'stripe',
      providerSessionId: providerSession.id,
    });

    if (!providerSession.url) {
      throw new HttpException(
        {
          code: 'CHECKOUT_PAYMENT_SESSION_UNAVAILABLE',
          message: 'Hosted payment page unavailable. Retry in a moment.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      sessionToken: session.token,
      provider: 'stripe',
      providerSessionId: providerSession.id,
      checkoutUrl: providerSession.url,
    };
  }

  async getPaymentStatus(
    user: AuthenticatedRequestUser,
    token: string,
    providerSessionId: string,
    requestId?: string,
  ): Promise<CheckoutPaymentStatusResponse> {
    const session = await this.findSessionOrThrow(token, user.id);

    if (!session.paymentProviderSessionId || session.paymentProviderSessionId !== providerSessionId) {
      throw new HttpException(
        {
          code: 'CHECKOUT_PAYMENT_SESSION_NOT_FOUND',
          message: 'Payment session not found for this checkout.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const reconciliation = await this.reconcilePaymentByProviderSessionId(
      providerSessionId,
      'return-flow',
      requestId,
    );
    const status = reconciliation.paymentStatus;

    this.logger.log({
      event: 'checkout.session.payment-status',
      userId: user.id,
      requestId: requestId ?? 'unknown-request-id',
      provider: 'stripe',
      providerSessionId,
      outcome: status,
      reconciliationOutcome: reconciliation.outcome,
      orderId: reconciliation.orderId,
      orderNumber: reconciliation.orderNumber,
    });

    return {
      sessionToken: session.token,
      provider: 'stripe',
      providerSessionId,
      status,
    };
  }

  async reconcilePaymentByProviderSessionId(
    providerSessionId: string,
    source: PaymentReconciliationSource,
    requestId?: string,
  ): Promise<PaymentReconciliationResult> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: {
        paymentProviderSessionId: providerSessionId,
      },
      include: checkoutSessionForOrderInclude,
    });

    if (!session) {
      this.logger.warn({
        event: 'checkout.payment.reconcile',
        source,
        requestId: requestId ?? 'unknown-request-id',
        provider: 'stripe',
        providerSessionId,
        outcome: 'missing-session',
      });

      return {
        providerSessionId,
        checkoutSessionId: null,
        checkoutSessionToken: null,
        paymentStatus: 'pending',
        outcome: 'missing_session',
        orderId: null,
        orderNumber: null,
      };
    }

    const providerSession = await this.stripeCheckoutProvider.retrieveSession(providerSessionId);
    const paymentStatus = this.mapStripeStatus(providerSession.status, providerSession.payment_status);

    if (paymentStatus === 'paid') {
      const idempotencyKey = this.buildPlaceOrderIdempotencyKey(session.token, providerSessionId);
      const finalized = await this.finalizePaidOrderFromSession({
        session,
        idempotencyKey,
        enforceIdempotencyKeyMatch: false,
        allowExpiredSession: true,
        requestId,
        source,
      });

      return {
        providerSessionId,
        checkoutSessionId: session.id,
        checkoutSessionToken: session.token,
        paymentStatus,
        outcome: finalized.replayed ? 'order_replay' : 'order_created',
        orderId: finalized.order.id,
        orderNumber: finalized.order.orderNumber,
      };
    }

    if (paymentStatus === 'failed' || paymentStatus === 'expired' || paymentStatus === 'canceled') {
      return this.reconcileTerminalPaymentState(session, paymentStatus, source, requestId);
    }

    // future: async payment method states - extend terminal-state mapping when enabled
    this.logger.log({
      event: 'checkout.payment.reconcile',
      source,
      requestId: requestId ?? 'unknown-request-id',
      provider: 'stripe',
      providerSessionId,
      checkoutSessionId: session.id,
      checkoutSessionToken: session.token,
      paymentStatus,
      outcome: 'waiting',
    });

    return {
      providerSessionId,
      checkoutSessionId: session.id,
      checkoutSessionToken: session.token,
      paymentStatus,
      outcome: 'waiting',
      orderId: session.order?.id ?? null,
      orderNumber: session.order?.orderNumber ?? null,
    };
  }

  async placeOrder(
    user: AuthenticatedRequestUser,
    input: PlaceOrderInput,
    requestId?: string,
  ): Promise<PlaceOrderResponse> {
    const session = await this.findSessionForOrderOrThrow(input.checkoutSessionToken, user.id);

    if (session.order) {
      this.assertIdempotencyReplayOrThrow(
        session.order.placeOrderIdempotencyKey,
        input.idempotencyKey,
      );

      this.logger.log({
        event: 'order.place',
        requestId: requestId ?? 'unknown-request-id',
        userId: user.id,
        orderId: session.order.id,
        orderNumber: session.order.orderNumber,
        idempotencyKey: input.idempotencyKey,
        outcome: 'replay',
      });

      return mapOrderRecord(session.order);
    }

    this.assertSessionIsActive(session);

    const blockingReasons = this.resolveBlockingReasons(
      session.selectedAddressId,
      session.contactEmail,
      session.contactPhone,
    );

    if (blockingReasons.length > 0 || !session.selectedAddress) {
      throw new HttpException(
        {
          code: 'CHECKOUT_NOT_READY',
          message: 'Complete required checkout details before placing order.',
        },
        HttpStatus.CONFLICT,
      );
    }

    if (!session.paymentProviderSessionId) {
      throw new HttpException(
        {
          code: 'CHECKOUT_PAYMENT_SESSION_NOT_FOUND',
          message: 'Payment session not found for this checkout.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const providerSession = await this.stripeCheckoutProvider.retrieveSession(
      session.paymentProviderSessionId,
    );
    const paymentStatus = this.mapStripeStatus(providerSession.status, providerSession.payment_status);
    if (paymentStatus !== 'paid') {
      throw new HttpException(
        {
          code: 'CHECKOUT_PAYMENT_NOT_PAID',
          message: 'Payment is not complete for this checkout.',
        },
        HttpStatus.CONFLICT,
      );
    }
    const finalized = await this.finalizePaidOrderFromSession({
      session,
      idempotencyKey: input.idempotencyKey,
      enforceIdempotencyKeyMatch: true,
      allowExpiredSession: false,
      requestId,
      source: 'return-flow',
    });

    this.logger.log({
      event: 'order.place',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      orderId: finalized.order.id,
      orderNumber: finalized.order.orderNumber,
      idempotencyKey: input.idempotencyKey,
      outcome: finalized.replayed ? 'replay' : 'success',
    });

    return mapOrderRecord(finalized.order);
  }

  private async finalizePaidOrderFromSession(input: {
    session: CheckoutSessionForOrder;
    idempotencyKey: string;
    enforceIdempotencyKeyMatch: boolean;
    allowExpiredSession: boolean;
    requestId?: string;
    source: PaymentReconciliationSource;
  }): Promise<{ order: OrderWithItems; replayed: boolean }> {
    if (input.session.order) {
      if (input.enforceIdempotencyKeyMatch) {
        this.assertIdempotencyReplayOrThrow(
          input.session.order.placeOrderIdempotencyKey,
          input.idempotencyKey,
        );
      }

      return {
        order: input.session.order,
        replayed: true,
      };
    }

    if (!input.allowExpiredSession) {
      this.assertSessionIsActive(input.session);
    }

    const liveSnapshot = this.mapCartSnapshot(input.session.cart as CartWithItems);
    this.assertCartIsCheckoutReady(liveSnapshot);

    const now = new Date();
    const paidTransition = this.buildOrderStatusTransitionPatch('pending_payment', 'paid', now);

    const finalized = await this.prisma.$transaction(async (transaction) => {
      const freshSession = await transaction.checkoutSession.findFirst({
        where: {
          id: input.session.id,
          userId: input.session.userId,
        },
        include: checkoutSessionForOrderInclude,
      });

      if (!freshSession) {
        throw new HttpException(
          {
            code: 'CHECKOUT_SESSION_NOT_FOUND',
            message: 'Checkout session not found.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (freshSession.order) {
        if (input.enforceIdempotencyKeyMatch) {
          this.assertIdempotencyReplayOrThrow(
            freshSession.order.placeOrderIdempotencyKey,
            input.idempotencyKey,
          );
        }

        return {
          order: freshSession.order,
          replayed: true,
        };
      }

      if (!input.allowExpiredSession) {
        this.assertSessionIsActive(freshSession);
      }

      if (!freshSession.selectedAddress || !freshSession.contactEmail || !freshSession.contactPhone) {
        throw new HttpException(
          {
            code: 'CHECKOUT_NOT_READY',
            message: 'Complete required checkout details before placing order.',
          },
          HttpStatus.CONFLICT,
        );
      }

      const freshSnapshot = this.mapCartSnapshot(freshSession.cart as CartWithItems);
      this.assertCartIsCheckoutReady(freshSnapshot);
      const freshPricing = this.computePricing(
        freshSnapshot.summary,
        freshSession.selectedAddress.country,
      );

      await this.atomicDecrementStockOrThrow(transaction, freshSession.cart.items);

      const order = await transaction.order.create({
        data: {
          orderNumber: this.generateOrderNumber(now),
          userId: freshSession.userId,
          checkoutSessionId: freshSession.id,
          placeOrderIdempotencyKey: input.idempotencyKey,
          paymentProvider: 'stripe',
          paymentProviderSessionId: freshSession.paymentProviderSessionId,
          status: paidTransition.status,
          paidAt: paidTransition.paidAt,
          currency: freshPricing.currency,
          subtotalCents: freshPricing.subtotalCents,
          shippingCents: freshPricing.shippingCents,
          taxCents: freshPricing.taxCents,
          totalCents: freshPricing.totalCents,
          contactEmail: freshSession.contactEmail,
          contactPhone: freshSession.contactPhone,
          shipToRecipientName: freshSession.selectedAddress.recipientName,
          shipToCountry: freshSession.selectedAddress.country,
          shipToCity: freshSession.selectedAddress.city,
          shipToPostalCode: freshSession.selectedAddress.postalCode,
          shipToLine1: freshSession.selectedAddress.line1,
          shipToLine2: freshSession.selectedAddress.line2,
          shipToPhone: freshSession.selectedAddress.phone,
          createdBy: freshSession.userId,
          updatedBy: freshSession.userId,
          // future: refunds lifecycle - placeholder schema reserved for later refund operations
          refundStatusPlaceholder: null,
          refundReasonPlaceholder: null,
          refundExternalRefPlaceholder: null,
          items: {
            create: freshSession.cart.items.map((item) => ({
              productId: item.productId,
              productSlug: item.product.slug,
              productName: item.product.name,
              productFit: item.product.fit,
              productColor: item.product.color,
              productSize: item.size,
              quantity: item.quantity,
              unitPriceCents: item.product.priceCents,
              lineSubtotalCents: item.product.priceCents * item.quantity,
              currency: item.product.currency,
              primaryImageUrl: item.product.primaryImageUrl,
              secondaryImageUrl: item.product.secondaryImageUrl,
            })),
          },
        },
        include: orderWithItemsInclude,
      });

      await transaction.cartItem.deleteMany({
        where: {
          cartId: freshSession.cartId,
        },
      });

      await transaction.checkoutSession.updateMany({
        where: {
          userId: freshSession.userId,
          cartId: freshSession.cartId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return {
        order,
        replayed: false,
      };
    });

    this.logger.log({
      event: 'checkout.order-finalize',
      source: input.source,
      requestId: input.requestId ?? 'unknown-request-id',
      userId: input.session.userId,
      checkoutSessionId: input.session.id,
      orderId: finalized.order.id,
      orderNumber: finalized.order.orderNumber,
      idempotencyKey: input.idempotencyKey,
      outcome: finalized.replayed ? 'replay' : 'created',
    });

    return {
      order: finalized.order,
      replayed: finalized.replayed,
    };
  }

  private async reconcileTerminalPaymentState(
    session: CheckoutSessionForOrder,
    paymentStatus: 'failed' | 'expired' | 'canceled',
    source: PaymentReconciliationSource,
    requestId?: string,
  ): Promise<PaymentReconciliationResult> {
    if (!session.order) {
      // future: inventory reservation ledger - needed only if pre-payment stock holds are introduced
      this.logger.log({
        event: 'checkout.payment.reconcile-terminal',
        source,
        requestId: requestId ?? 'unknown-request-id',
        provider: 'stripe',
        providerSessionId: session.paymentProviderSessionId,
        checkoutSessionId: session.id,
        checkoutSessionToken: session.token,
        paymentStatus,
        outcome: 'no-order',
      });

      return {
        providerSessionId: session.paymentProviderSessionId ?? 'unknown-provider-session-id',
        checkoutSessionId: session.id,
        checkoutSessionToken: session.token,
        paymentStatus,
        outcome: 'terminal_no_order',
        orderId: null,
        orderNumber: null,
      };
    }

    if (session.order.status !== PrismaOrderStatus.PENDING_PAYMENT) {
      this.logger.log({
        event: 'checkout.payment.reconcile-terminal',
        source,
        requestId: requestId ?? 'unknown-request-id',
        provider: 'stripe',
        providerSessionId: session.paymentProviderSessionId,
        checkoutSessionId: session.id,
        checkoutSessionToken: session.token,
        orderId: session.order.id,
        orderNumber: session.order.orderNumber,
        orderStatus: session.order.status,
        paymentStatus,
        outcome: 'ignored-stale',
      });

      return {
        providerSessionId: session.paymentProviderSessionId ?? 'unknown-provider-session-id',
        checkoutSessionId: session.id,
        checkoutSessionToken: session.token,
        paymentStatus,
        outcome: 'terminal_ignored',
        orderId: session.order.id,
        orderNumber: session.order.orderNumber,
      };
    }

    const now = new Date();
    const cancelledTransition = this.buildOrderStatusTransitionPatch(
      'pending_payment',
      'cancelled',
      now,
    );

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: session.order.id,
      },
      data: {
        status: cancelledTransition.status,
        cancelledAt: cancelledTransition.cancelledAt,
        updatedBy: session.order.updatedBy,
      },
      include: orderWithItemsInclude,
    });

    this.logger.log({
      event: 'checkout.payment.reconcile-terminal',
      source,
      requestId: requestId ?? 'unknown-request-id',
      provider: 'stripe',
      providerSessionId: session.paymentProviderSessionId,
      checkoutSessionId: session.id,
      checkoutSessionToken: session.token,
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      paymentStatus,
      outcome: 'cancelled',
    });

    return {
      providerSessionId: session.paymentProviderSessionId ?? 'unknown-provider-session-id',
      checkoutSessionId: session.id,
      checkoutSessionToken: session.token,
      paymentStatus,
      outcome: 'terminal_applied',
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
    };
  }

  private buildPlaceOrderIdempotencyKey(sessionToken: string, providerSessionId: string): string {
    return `order:${sessionToken}:${providerSessionId}`;
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

  private async atomicDecrementStockOrThrow(
    transaction: Prisma.TransactionClient,
    cartItems: CheckoutSessionForOrder['cart']['items'],
  ): Promise<void> {
    for (const item of cartItems) {
      const update = await transaction.product.updateMany({
        where: {
          id: item.productId,
          available: true,
          stock: {
            gte: item.quantity,
          },
        },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });

      if (update.count !== 1) {
        throw new HttpException(
          {
            code: 'CHECKOUT_STOCK_REVALIDATION_FAILED',
            message: 'Stock changed before order placement. Refresh cart and retry.',
          },
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  private buildOrderStatusTransitionPatch(
    current: OrderStatus,
    next: OrderStatus,
    changedAt: Date,
  ): {
    status: PrismaOrderStatus;
    paidAt?: Date;
    cancelledAt?: Date;
    refundedAt?: Date;
    shippedAt?: Date;
    deliveredAt?: Date;
  } {
    this.assertOrderStatusTransitionOrThrow(current, next);

    const patch: {
      status: PrismaOrderStatus;
      paidAt?: Date;
      cancelledAt?: Date;
      refundedAt?: Date;
      shippedAt?: Date;
      deliveredAt?: Date;
    } = {
      status: this.toPrismaOrderStatus(next),
    };

    if (next === 'paid') {
      patch.paidAt = changedAt;
    }

    if (next === 'cancelled') {
      patch.cancelledAt = changedAt;
    }

    if (next === 'refunded') {
      patch.refundedAt = changedAt;
    }

    // future: fulfillment transitions - shipped/delivered mutation path added in later admin flow
    if (next === 'shipped') {
      patch.shippedAt = changedAt;
    }

    if (next === 'delivered') {
      patch.deliveredAt = changedAt;
    }

    return patch;
  }

  private assertOrderStatusTransitionOrThrow(current: OrderStatus, next: OrderStatus): void {
    if (current === next) {
      return;
    }

    if (ORDER_STATUS_TRANSITIONS[current]?.includes(next)) {
      return;
    }

    throw new HttpException(
      {
        code: 'ORDER_STATUS_TRANSITION_INVALID',
        message: `Invalid order status transition from ${current} to ${next}.`,
      },
      HttpStatus.CONFLICT,
    );
  }

  private toPrismaOrderStatus(status: OrderStatus): PrismaOrderStatus {
    switch (status) {
      case 'paid':
        return PrismaOrderStatus.PAID;
      case 'processing':
        return PrismaOrderStatus.PROCESSING;
      case 'shipped':
        return PrismaOrderStatus.SHIPPED;
      case 'delivered':
        return PrismaOrderStatus.DELIVERED;
      case 'cancelled':
        return PrismaOrderStatus.CANCELLED;
      case 'refunded':
        return PrismaOrderStatus.REFUNDED;
      case 'pending_payment':
      default:
        return PrismaOrderStatus.PENDING_PAYMENT;
    }
  }

  private assertIdempotencyReplayOrThrow(existingKey: string, requestedKey: string): void {
    if (existingKey === requestedKey) {
      return;
    }

    throw new HttpException(
      {
        code: 'ORDER_IDEMPOTENCY_KEY_MISMATCH',
        message: 'Order was already created with a different idempotency key.',
      },
      HttpStatus.CONFLICT,
    );
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
    const pricing = this.computePricing(snapshot.summary, session.selectedAddress?.country ?? null);

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
      cartSnapshot: snapshot,
      priceValidatedAt: session.priceValidatedAt.toISOString(),
      pricing,
    };
  }

  private computePricing(summary: CartSummary, country: string | null): CheckoutPricingBreakdown {
    const subtotalCents = summary.subtotalCents;
    const shippingCents = subtotalCents > 0 ? this.env.CHECKOUT_SHIPPING_CENTS : 0;
    const taxRate = this.resolveTaxRate(country);
    const taxableCents = subtotalCents + shippingCents;
    const taxCents = Math.round(taxableCents * taxRate);
    const totalCents = subtotalCents + shippingCents + taxCents;

    return {
      currency: summary.currency,
      subtotalCents,
      shippingCents,
      taxRate,
      taxCents,
      totalCents,
    };
  }

  private resolveTaxRate(country: string | null): number {
    const normalizedCountry = (country ?? '').trim().toUpperCase();

    if (normalizedCountry === 'US' || normalizedCountry === 'USA') {
      return this.env.CHECKOUT_TAX_RATE_US;
    }

    if (normalizedCountry === 'CA' || normalizedCountry === 'CAN' || normalizedCountry === 'CANADA') {
      return this.env.CHECKOUT_TAX_RATE_CA;
    }

    return this.env.CHECKOUT_TAX_RATE_DEFAULT;
  }

  private buildPricingFingerprint(
    userId: string,
    token: string,
    pricing: CheckoutPricingBreakdown,
  ): string {
    return createHash('sha256')
      .update(
        `${userId}:${token}:${pricing.subtotalCents}:${pricing.shippingCents}:${pricing.taxCents}:${pricing.totalCents}`,
      )
      .digest('hex');
  }

  private mapStripeStatus(
    status: string | null,
    paymentStatus: string | null,
  ): CheckoutPaymentStatus {
    if (status === 'canceled') {
      return 'canceled';
    }

    if (status === 'expired') {
      return 'expired';
    }

    if (status === 'complete' && paymentStatus === 'paid') {
      return 'paid';
    }

    if (status === 'complete' && paymentStatus === 'unpaid') {
      return 'failed';
    }

    if (status === 'open') {
      return 'open';
    }

    return 'pending';
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

  private async findSessionForOrderOrThrow(
    token: string,
    userId: string,
  ): Promise<CheckoutSessionForOrder> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: {
        token,
        userId,
      },
      include: checkoutSessionForOrderInclude,
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

  private generateOrderNumber(now: Date): string {
    const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
    const randomPart = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    return `SP-${datePart}-${randomPart}`;
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
