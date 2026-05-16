import { AuthGuard } from '../../../components/auth-guard';
import { CartPageContent } from '../../../components/cart-wishlist/cart-page-content';

export default function CartPage() {
  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[92rem]">
        <AuthGuard>
          <CartPageContent />
        </AuthGuard>
      </div>
    </main>
  );
}
