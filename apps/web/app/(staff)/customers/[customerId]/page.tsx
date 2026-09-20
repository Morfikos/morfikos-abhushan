import { CustomerProfile } from "@/features/customers/customer-profile";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerProfile customerId={customerId} />;
}
