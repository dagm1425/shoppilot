import { AuthGuard } from '../../../components/auth-guard';
import { CheckoutPageContent } from '../../../components/checkout/checkout-page-content';

export default function CheckoutPage() {
  return (
    <main id="main-content" className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[92rem]">
        <AuthGuard>
          <CheckoutPageContent />
        </AuthGuard>
      </div>
    </main>
  );
}
