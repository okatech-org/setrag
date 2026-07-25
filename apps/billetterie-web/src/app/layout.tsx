import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Billetterie du Transgabonais",
    template: "%s · SETRAG",
  },
  description:
    "Réservez et payez vos billets de train sur la ligne Owendo–Franceville : horaires, disponibilités et billets électroniques.",
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
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  )
}
