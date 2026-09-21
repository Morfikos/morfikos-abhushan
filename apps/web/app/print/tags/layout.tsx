import { Suspense, type ReactNode } from "react";

import { TagPrintSkeleton } from "@/components/application/skeleton/skeleton";

export default function PrintTagsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<TagPrintSkeleton />}>{children}</Suspense>;
}
