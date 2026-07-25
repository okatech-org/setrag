import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Portail agent",
    template: "%s · Portail agent SETRAG",
  },
  description:
    "Back-office SETRAG : vente au guichet, contrôle des billets, suivi des dessertes et pilotage de l'exploitation.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#15704A",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-dvh bg-background-muted">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
