import { Suspense } from "react";

import { GirviDirectoryLoading, GirviList } from "@/features/girvi/girvi-list";

export default function GirviPage() {
  return (
    <Suspense fallback={<GirviDirectoryLoading />}>
      <GirviList />
    </Suspense>
  );
}
