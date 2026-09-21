import { Suspense } from "react";

import { SettingsPageSkeleton } from "@/components/application/skeleton/skeleton";
import { SettingsWorkspace } from "@/features/settings/settings-workspace";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsWorkspace />
    </Suspense>
  );
}
