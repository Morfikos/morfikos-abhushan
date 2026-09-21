import { Suspense } from "react";

import { InventoryDirectoryLoading, InventoryList } from "@/features/inventory/inventory-list";

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryDirectoryLoading />}>
      <InventoryList />
    </Suspense>
  );
}
