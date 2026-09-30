import type { Metadata } from "next"

import { Notifications } from "@/fonctionnalites/notifications/notifications"

export const metadata: Metadata = {
  title: "Notifications",
  description: "Les messages de la billetterie SETRAG sur vos voyages.",
}

export default function PageNotifications() {
  return <Notifications />
}
