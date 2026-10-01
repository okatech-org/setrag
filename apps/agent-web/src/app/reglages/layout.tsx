import { PortalGuard } from "@/components/portal-guard"

/** Réglages du compte : communs au guichet et à la gestion. */
export default function ReglagesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="tous">{children}</PortalGuard>
}
