"use client"

import AppConvexProvider from "@workspace/api/provider"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ThemeProvider } from "next-themes"
import { useState, type ReactNode } from "react"

import { DonneesLocalesProvider } from "@/components/offline/donnees-locales"
import { IS_E2E } from "@/lib/ticketing"

const BROWSER_E2E = IS_E2E && process.env.NODE_ENV !== "test"

function E2EConvexProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  )
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
      {/* La copie locale est montée sous le client Convex, dont elle dépend,
          et au-dessus de tous les écrans : elle doit enregistrer les billets
          même si le voyageur n'ouvre jamais « Mes billets » avec du réseau. */}
      {BROWSER_E2E ? (
        <E2EConvexProvider>
          <DonneesLocalesProvider>{children}</DonneesLocalesProvider>
        </E2EConvexProvider>
      ) : (
        <AppConvexProvider>
          <DonneesLocalesProvider>{children}</DonneesLocalesProvider>
        </AppConvexProvider>
      )}
    </ThemeProvider>
  )
}
