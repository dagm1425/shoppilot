import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductDetailsPanel, type ProductDetails } from '../../../../components/product-details-panel';
import { ProductImageGallery } from '../../../../components/product-image-gallery';
import { fetchCatalogProductDetails } from '../../../../lib/catalog-api';

type ProductDetailsPageProps = {
  params: Promise<{ productId: string }>;
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const { productId } = await params;
  const response = await fetchCatalogProductDetails(productId);

  if (!response.ok) {
    if (response.code === 'PRODUCT_NOT_FOUND') {
      notFound();
    }

    return (
      <main id="main-content" className="min-h-screen bg-card px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card p-6">
          <h1 className="font-auth-heading text-xl font-bold uppercase tracking-wider text-foreground">
            Product unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{response.message}</p>
          <Link
            href="/catalog"
            className="mt-4 inline-flex rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Back to catalog
          </Link>
        </div>
      </main>
    );
  }

  const { product } = response.data;
  const productImages = product.images.map((image, index) => ({
    src: image,
    alt: `${product.name} image ${index + 1}`,
  }));

  const panelProduct: ProductDetails = {
    productId: product.productId,
    name: product.name,
    description: product.description,
    fit: product.fit,
    color: product.color,
    priceLabel: formatMoney(product.priceCents, product.currency),
    available: product.available,
    stock: product.stock,
  };

  return (
    <main id="main-content" className="min-h-screen bg-card px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[92rem]">
        <section className="grid gap-4 lg:grid-cols-2 lg:gap-0 lg:items-start">
          <ProductImageGallery
            productId={panelProduct.productId}
            productName={panelProduct.name}
            images={productImages}
          />

          <div className="lg:flex lg:justify-center lg:pt-10">
            <div className="lg:sticky lg:top-24 lg:h-fit">
              <ProductDetailsPanel product={panelProduct} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
