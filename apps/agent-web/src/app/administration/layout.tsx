import { PortalGuard } from "@/components/portal-guard"

export default function AdministrationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
