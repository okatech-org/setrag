import { PortalGuard } from "@/components/portal-guard"

export default function StudiesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
