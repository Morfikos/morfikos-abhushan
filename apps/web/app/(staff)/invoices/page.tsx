import { Suspense } from "react";

import { InvoiceList, InvoicesDirectoryLoading } from "@/features/invoices/invoice-list";

export default function InvoicesPage() {
  return (
    <Suspense fallback={<InvoicesDirectoryLoading />}>
      <InvoiceList />
    </Suspense>
  );
}
