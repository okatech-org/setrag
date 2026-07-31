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
  appleWebApp: {
    capable: true,
    title: "Contrôle SETRAG",
    statusBarStyle: "black-translucent",
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
