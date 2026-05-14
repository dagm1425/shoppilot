import { notFound } from 'next/navigation';
import { getCatalogProductBySlug } from '../../../../../components/catalog-products.data';
import { ProductDetailsPanel, type ProductDetails } from '../../../../../components/product-details-panel';

type ProductDetailsPageProps = {
  params: Promise<{ slug: string }>;
};

const PRODUCT_SIZES: ProductDetails['sizes'] = [
  { label: 'XS', value: 'xs' },
  { label: 'S', value: 's' },
  { label: 'M', value: 'm' },
  { label: 'L', value: 'l' },
  { label: 'XL', value: 'xl' },
  { label: 'XXL', value: 'xxl' },
  { label: '3XL', value: '3xl', disabled: true },
];

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const { slug } = await params;
  const product = getCatalogProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const panelProduct: ProductDetails = {
    id: product.id,
    name: product.name,
    fit: product.fit,
    price: product.price,
    isNew: product.isNew,
    variants: [
      { id: `${product.id}-a`, label: product.color, image: product.primaryImage },
      { id: `${product.id}-b`, label: 'Core Black', image: product.secondaryImage },
      { id: `${product.id}-c`, label: 'Graphite Grey', image: 'https://images.unsplash.com/photo-1618354691321-e851c56960d1?q=80&w=400&auto=format&fit=crop' },
      { id: `${product.id}-d`, label: 'Deep Blue', image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=400&auto=format&fit=crop' },
    ],
    sizes: PRODUCT_SIZES,
    accordionSections: [
      {
        id: 'description',
        title: 'Description',
        content:
          'A lightweight training essential designed for everyday workouts. This placeholder description will be replaced by product-specific copy from catalog data in the next integration step.',
      },
      {
        id: 'delivery',
        title: 'Delivery & Returns',
        content:
          'Standard and express delivery options are available depending on location. Returns are accepted within the policy window when items are unworn and tags remain attached.',
      },
    ],
  };

  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-lg border border-dashed border-border bg-card p-6 sm:p-8">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Product images
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Placeholder space reserved for the production image gallery.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="aspect-[4/5] rounded-md bg-muted" />
            <div className="aspect-[4/5] rounded-md bg-muted" />
            <div className="aspect-[4/5] rounded-md bg-muted" />
            <div className="aspect-[4/5] rounded-md bg-muted" />
          </div>
        </section>

        <div className="lg:sticky lg:top-24 lg:justify-self-end">
          <ProductDetailsPanel product={panelProduct} />
        </div>
      </div>
    </main>
  );
}
