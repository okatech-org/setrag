import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import { SiteShell } from "@/components/site-shell"
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
  // Bleu du logo — l'accent du design system. La barre système du téléphone
  // s'y aligne, elle est trop visible en mobile pour rester sur une autre teinte.
  themeColor: "#0F52A0",
  width: "device-width",
  initialScale: 1,
  // Sans `cover`, `env(safe-area-inset-*)` renvoie 0 et les utilitaires
  // `pt-safe` / `pb-safe` laisseraient le contenu sous l'encoche.
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-dvh bg-canvas">
        <Providers>
          <SiteShell>{children}</SiteShell>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  )
}
