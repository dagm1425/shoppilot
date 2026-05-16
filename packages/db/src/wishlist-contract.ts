export type WishlistItem = {
  itemId: string;
  productId: string;
  name: string;
  fit: string;
  color: string;
  available: boolean;
  stock: number;
  priceCents: number;
  currency: string;
  primaryImageUrl: string;
  secondaryImageUrl?: string | null;
};

export type WishlistSummary = {
  itemCount: number;
};

export type WishlistResponse = {
  items: WishlistItem[];
  summary: WishlistSummary;
};

export type AddWishlistItemInput = {
  productId: string;
};
