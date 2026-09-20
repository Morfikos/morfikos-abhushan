import { Suspense } from "react";

import { SettingsWorkspace } from "@/features/settings/settings-workspace";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsWorkspace />
    </Suspense>
  );
}
