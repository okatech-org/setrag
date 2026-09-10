import { PortalGuard } from "@/components/portal-guard"

export default function OfficeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
