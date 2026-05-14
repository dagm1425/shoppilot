import { CatalogProductGrid } from '../../../components/catalog-product-grid';
import { CatalogFilterSidebar } from '../../../components/catalog-filter-sidebar';

export default function CatalogPage() {
  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
          <CatalogFilterSidebar />
          <CatalogProductGrid />
        </div>
      </div>
    </main>
  );
}
