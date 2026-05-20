export type CatalogSort = 'relevance' | 'newest' | 'price-asc' | 'price-desc';

export type CatalogCategory = 'bottoms' | 'tops';
export type CatalogGender = 'men' | 'women';
export type CatalogPriceRange = 'under-25' | '25-40' | 'over-40';

export type CatalogListQuery = {
  page: number;
  pageSize: number;
  sort: CatalogSort;
  category?: CatalogCategory;
  gender?: CatalogGender;
  price?: CatalogPriceRange;
  q?: string;
};

export type CatalogProductListItem = {
  productId: string;
  name: string;
  category: CatalogCategory;
  gender: CatalogGender;
  fit: string;
  color: string;
  priceCents: number;
  currency: string;
  available: boolean;
  primaryImageUrl: string;
  secondaryImageUrl?: string | null;
};

export type CatalogListResponse = {
  items: CatalogProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  appliedFilters: {
    sort: CatalogSort;
    category?: CatalogCategory;
    gender?: CatalogGender;
    price?: CatalogPriceRange;
    q?: string;
  };
};

export type CatalogProductDetails = {
  productId: string;
  name: string;
  description: string;
  category: CatalogCategory;
  gender: CatalogGender;
  fit: string;
  color: string;
  rating: number;
  priceCents: number;
  currency: string;
  available: boolean;
  stock: number;
  images: string[];
  createdAt: string;
};

export type CatalogProductDetailsResponse = {
  product: CatalogProductDetails;
};
