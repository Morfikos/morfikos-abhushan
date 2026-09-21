import { Noto_Sans_Devanagari } from "next/font/google";
import { Suspense, type ReactNode } from "react";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { PrintStaffGate } from "@/features/auth/print-staff-gate";

const printDocFont = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  weight: ["400", "700"],
  variable: "--font-print-doc",
  display: "swap",
});

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <PrintStaffGate>
      <div
        className={`${printDocFont.variable} min-h-screen bg-white text-black antialiased print:bg-white print:text-black`}
        style={{ fontFamily: "var(--font-print-doc), sans-serif" }}
      >
        <Suspense fallback={<PrintDocumentSkeleton />}>{children}</Suspense>
      </div>
    </PrintStaffGate>
  );
}
