import { PortalGuard } from "@/components/portal-guard"

export default function CopilotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
