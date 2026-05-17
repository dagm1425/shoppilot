import { OrderConfirmationContent } from '../../../../components/orders/order-confirmation-content';

type OrderConfirmationPageProps = {
  params: Promise<{
    orderNumber: string;
  }>;
};

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = await params;

  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <OrderConfirmationContent orderNumber={orderNumber} />
      </div>
    </main>
  );
}
