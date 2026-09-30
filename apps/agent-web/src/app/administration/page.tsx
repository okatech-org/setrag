import type { Metadata } from "next"

import { ModuleAccessAdministration } from "@/components/module-access-administration"

export const metadata: Metadata = {
  title: "Administration des accès modulaires",
}

export default function AdministrationPage() {
  return <ModuleAccessAdministration />
}
