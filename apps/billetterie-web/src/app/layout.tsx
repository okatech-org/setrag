import type { Metadata, Viewport } from "next"

import { Coquille } from "@/coquille/coquille"
import { Fournisseurs } from "@/coquille/fournisseurs"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SETRAG — Billetterie du Transgabonais",
    template: "%s · SETRAG",
  },
  description:
    "Réservez et payez vos billets de train sur la ligne Owendo–Franceville : horaires, places, billets électroniques lisibles sans réseau.",
  applicationName: "SETRAG",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/marque/setrag-symbole.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    // Installée depuis Safari, l'application s'ouvre en plein écran plutôt
    // que dans un onglet : c'est le seul moyen, sur iOS, d'avoir une icône sur
    // l'écran d'accueil et une fenêtre sans barre d'adresse.
    capable: true,
    title: "SETRAG",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  // La barre système se fond dans le fond de l'app (--c-canvas), clair ou
  // sombre : c'est ce qui donne à la version installée l'allure d'une app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0C121A" },
  ],
  width: "device-width",
  initialScale: 1,
  // Sans `cover`, `env(safe-area-inset-*)` renvoie 0 et les utilitaires
  // `pt-safe` / `pb-safe` laisseraient le contenu sous l'encoche.
  viewportFit: "cover",
}

export default function RacineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="bg-canvas">
        <Fournisseurs>
          <Coquille>{children}</Coquille>
        </Fournisseurs>
      </body>
    </html>
  )
}
