import { Suspense } from "react";

import {
  NotificationsDirectoryLoading,
  NotificationsList,
} from "@/features/notifications/notifications-list";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsDirectoryLoading />}>
      <NotificationsList />
    </Suspense>
  );
}
