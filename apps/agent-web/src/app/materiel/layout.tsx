import { ModuleGuard } from "@/components/module-guard"
import { PortalGuard } from "@/components/portal-guard"

export default function RollingStockLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalGuard portal="gestion">
      <ModuleGuard moduleCode="gmao">{children}</ModuleGuard>
    </PortalGuard>
  )
}
