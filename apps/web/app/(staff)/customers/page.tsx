import { Suspense } from "react";

import { CustomerList, CustomersDirectoryLoading } from "@/features/customers/customer-list";

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersDirectoryLoading />}>
      <CustomerList />
    </Suspense>
  );
}
