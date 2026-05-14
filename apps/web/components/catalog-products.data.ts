export type CatalogProduct = {
  id: string;
  name: string;
  fit: string;
  color: string;
  price: string;
  rating: string;
  href: string;
  primaryImage: string;
  secondaryImage: string;
  isNew?: boolean;
};

export const CATALOG_PLACEHOLDER_PRODUCTS: CatalogProduct[] = [
  {
    id: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    fit: 'Oversized fit',
    color: 'Force Blue',
    price: '$30',
    rating: '4.5',
    href: '/catalog/products/arrival-oversized-tank',
    primaryImage: 'https://images.unsplash.com/photo-1583454110551-21f2fa2adfcd?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1574680077505-ff925e7e32ef?q=80&w=800&auto=format&fit=crop',
    isNew: true,
  },
  {
    id: 'vital-seamless-legging',
    name: 'Vital Seamless Legging',
    fit: 'High-rise fit',
    color: 'Night Grey',
    price: '$48',
    rating: '4.7',
    href: '/catalog/products/vital-seamless-legging',
    primaryImage: 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
    isNew: true,
  },
  {
    id: 'essential-cropped-tee',
    name: 'Essential Cropped Tee',
    fit: 'Relaxed fit',
    color: 'White',
    price: '$24',
    rating: '4.4',
    href: '/catalog/products/essential-cropped-tee',
    primaryImage: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'studio-training-jogger',
    name: 'Studio Training Jogger',
    fit: 'Tapered fit',
    color: 'Stone',
    price: '$52',
    rating: '4.8',
    href: '/catalog/products/studio-training-jogger',
    primaryImage: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'power-hoodie',
    name: 'Power Hoodie',
    fit: 'Regular fit',
    color: 'Black',
    price: '$60',
    rating: '4.6',
    href: '/catalog/products/power-hoodie',
    primaryImage: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'everyday-training-short',
    name: 'Everyday Training Short',
    fit: 'Athletic fit',
    color: 'Carbon',
    price: '$34',
    rating: '4.3',
    href: '/catalog/products/everyday-training-short',
    primaryImage: 'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'flow-sports-bra',
    name: 'Flow Sports Bra',
    fit: 'Supportive fit',
    color: 'Sage',
    price: '$36',
    rating: '4.7',
    href: '/catalog/products/flow-sports-bra',
    primaryImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop',
    isNew: true,
  },
  {
    id: 'lift-seamless-tee',
    name: 'Lift Seamless Tee',
    fit: 'Slim fit',
    color: 'Olive',
    price: '$32',
    rating: '4.5',
    href: '/catalog/products/lift-seamless-tee',
    primaryImage: 'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?q=80&w=800&auto=format&fit=crop',
    secondaryImage: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop',
  },
];

export function getCatalogProductBySlug(slug: string) {
  return CATALOG_PLACEHOLDER_PRODUCTS.find((product) => product.id === slug);
}
