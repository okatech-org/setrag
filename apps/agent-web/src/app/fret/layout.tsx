import { ModuleGuard } from "@/components/module-guard"
import { PortalGuard } from "@/components/portal-guard"

export default function FreightLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalGuard portal="gestion">
      <ModuleGuard moduleCode="fret">{children}</ModuleGuard>
    </PortalGuard>
  )
}
