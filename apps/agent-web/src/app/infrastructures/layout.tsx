import { ModuleGuard } from "@/components/module-guard"
import { PortalGuard } from "@/components/portal-guard"

export default function InfrastructureLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalGuard portal="gestion">
      <ModuleGuard moduleCode="infrastructure">{children}</ModuleGuard>
    </PortalGuard>
  )
}
