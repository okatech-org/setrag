import { PortalGuard } from "@/components/portal-guard"

export default function FinanceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
