import { Suspense } from "react";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { PaymentsWorkspace } from "@/features/payments/payments-workspace";

export default function PaymentsPage() {
  return (
    <Suspense fallback={<LoadingIndicator size="md" label="Loading payments" />}>
      <PaymentsWorkspace />
    </Suspense>
  );
}
