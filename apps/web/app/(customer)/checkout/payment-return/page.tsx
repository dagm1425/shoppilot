import { AuthGuard } from '../../../../components/auth-guard';
import { CheckoutPaymentReturnContent } from '../../../../components/checkout/checkout-payment-return-content';

export default function CheckoutPaymentReturnPage() {
  return (
    <main id="main-content" className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[64rem]">
        <AuthGuard>
          <CheckoutPaymentReturnContent />
        </AuthGuard>
      </div>
    </main>
  );
}
