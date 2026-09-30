"use client"

import AppConvexProvider from "@workspace/api/provider"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { Toaster } from "sonner"

import { RubanProvider } from "@/fonctionnalites/assistant/contexte-ruban"
import { DonneesLocalesProvider } from "@/fonctionnalites/hors-ligne/donnees-locales"

export function Fournisseurs({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AppConvexProvider>
        {/* La copie locale est montée sous le client Convex, dont elle dépend,
            et au-dessus de tous les écrans : elle doit enregistrer les billets
            même si le voyageur n'ouvre jamais « Mes billets » avec du réseau. */}
        <DonneesLocalesProvider>
          {/* Ruban survit aux changements de page : la conversation commencée
              dans la fenêtre se poursuit partout, jusqu'à /assistant. */}
          <RubanProvider>{children}</RubanProvider>
        </DonneesLocalesProvider>
      </AppConvexProvider>
      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex w-[min(92vw,420px)] items-center gap-3 rounded-md bg-ink px-4 py-3.5 text-[15px] font-medium text-ink-inverse shadow-lg [&_svg]:size-[18px]",
            actionButton: "ml-auto font-semibold text-accent-on-ink",
          },
        }}
      />
    </ThemeProvider>
  )
}
