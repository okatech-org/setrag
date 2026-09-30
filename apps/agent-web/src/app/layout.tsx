import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Portail Agent",
    template: "%s · Portail Agent SETRAG",
  },
  description:
    "Portail SETRAG : vente au guichet, back-office, modules d’entreprise et pilotage de la Direction générale.",
  icons: {
    icon: { url: "/setrag-logo.png", type: "image/png" },
    apple: "/setrag-logo.png",
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#0F52A0",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-dvh bg-canvas">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
