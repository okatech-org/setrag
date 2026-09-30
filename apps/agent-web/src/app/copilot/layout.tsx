import { ModuleGuard } from "@/components/module-guard"
import { PortalGuard } from "@/components/portal-guard"

export default function CopilotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalGuard portal="gestion">
      <ModuleGuard moduleCode="copilot">{children}</ModuleGuard>
    </PortalGuard>
  )
}
