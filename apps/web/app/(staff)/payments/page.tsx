import { Suspense } from "react";

import { PaymentsWorkspace, PaymentsWorkspaceLoading } from "@/features/payments/payments-workspace";

export default function PaymentsPage() {
  return (
    <Suspense fallback={<PaymentsWorkspaceLoading />}>
      <PaymentsWorkspace />
    </Suspense>
  );
}
