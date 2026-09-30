import type { Metadata, Viewport } from "next"

import { Demarrage } from "@/coquille/demarrage"
import { Fournisseurs } from "@/coquille/fournisseurs"
import { ServiceWorker } from "@/coquille/service-worker"
import { SCRIPT_AFFICHAGE } from "@/lib/script-affichage"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Contrôle à bord",
    template: "%s · Contrôle SETRAG",
  },
  description:
    "Application de contrôle à bord du Transgabonais : vérification des titres, régularisation, procès-verbaux et signalements, y compris hors réseau.",
  applicationName: "Contrôle SETRAG",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Contrôle SETRAG",
    /**
     * `default`, et surtout PAS `black-translucent` : ce dernier fait passer
     * le contenu SOUS la barre d'état, et l'heure se superposerait au
     * bandeau de service.
     */
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  // La barre système prend le fond de l'écran (--c-canvas), clair ou sombre.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0C121A" },
  ],
  width: "device-width",
  initialScale: 1,
  // Le terminal se tient d'une main en marche : un zoom accidentel décalerait
  // le viseur au moment du scan.
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Thème de nuit et contraste appliqués avant le premier rendu. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_AFFICHAGE }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink">
        <Fournisseurs>
          <Demarrage />
          {children}
          <ServiceWorker />
        </Fournisseurs>
      </body>
    </html>
  )
}
