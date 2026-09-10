import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Portail de vente",
    template: "%s · Vente SETRAG",
  },
  description:
    "Portail SETRAG pour la vente au guichet, l’encaissement et le suivi des opérations.",
  icons: {
    icon: { url: "/setrag-logo.png", type: "image/png" },
    apple: "/setrag-logo.png",
  },
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
      <body className="bg-background-muted min-h-dvh">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
