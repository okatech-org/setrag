import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"

import { Providers } from "@/components/providers"
import { ServiceWorker } from "@/components/service-worker"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Contrôle à bord",
    template: "%s · Contrôle SETRAG",
  },
  description:
    "Application de contrôle à bord du Transgabonais : vérification des titres, régularisation, procès-verbaux et signalements, y compris hors réseau.",
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
     * `default`, et surtout PAS `black-translucent`.
     *
     * Ce dernier fait passer le contenu SOUS la barre d'état : l'heure et la
     * batterie se superposent alors au titre de l'écran, et il revient à
     * l'application de compenser au pixel près. Un terminal de contrôle n'a
     * rien à gagner à cette immersion — iOS réserve la barre, le contenu
     * commence dessous, et l'écran reste lisible sur tous les modèles.
     */
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#2f4d8f",
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
      <body className="bg-canvas min-h-dvh">
        <Providers>
          {children}
          <ServiceWorker />
          <Toaster position="top-center" richColors closeButton />
        </Providers>
      </body>
    </html>
  )
}
