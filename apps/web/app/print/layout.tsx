import { Suspense, type ReactNode } from "react";

import { PrintStaffGate } from "@/features/auth/print-staff-gate";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <PrintStaffGate>
      <div className="min-h-screen bg-white text-black antialiased print:bg-white print:text-black">
        <Suspense fallback={<p className="p-4 text-sm">Loading print view…</p>}>{children}</Suspense>
      </div>
    </PrintStaffGate>
  );
}
