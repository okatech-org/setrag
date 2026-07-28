import { PortalGuard } from "@/components/portal-guard"

export default function SaleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="vente">{children}</PortalGuard>
}
