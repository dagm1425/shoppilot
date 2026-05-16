export type CartItemInvalidReason = 'PRODUCT_UNAVAILABLE' | 'INSUFFICIENT_STOCK';
export type CartProductSize = 's' | 'm' | 'l' | 'xl';

export type CartLineItem = {
  itemId: string;
  productId: string;
  name: string;
  fit: string;
  color: string;
  size: CartProductSize;
  quantity: number;
  stock: number;
  available: boolean;
  priceCents: number;
  currency: string;
  primaryImageUrl: string;
  secondaryImageUrl?: string | null;
  isValid: boolean;
  invalidReason?: CartItemInvalidReason;
  lineSubtotalCents: number;
};

export type CartSummary = {
  itemCount: number;
  validLineCount: number;
  subtotalCents: number;
  currency: string;
};

export type CartResponse = {
  items: CartLineItem[];
  summary: CartSummary;
};

export type AddCartItemInput = {
  productId: string;
  size: CartProductSize;
  quantity: number;
};

export type UpdateCartItemInput = {
  quantity: number;
};
