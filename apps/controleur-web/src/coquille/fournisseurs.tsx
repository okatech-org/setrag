"use client"

import AppConvexProvider from "@workspace/api/provider"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { Toaster } from "sonner"

import { ThemeTerminal } from "./theme-terminal"

export function Fournisseurs({ children }: { children: ReactNode }) {
  return (
    // Le thème ne suit pas le téléphone : il suit l'heure (sombre la nuit) ou
    // le choix de l'agent — voir `ThemeTerminal`.
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeTerminal />
      <AppConvexProvider>{children}</AppConvexProvider>
      <Toaster
        position="top-center"
        offset={{ top: "calc(env(safe-area-inset-top, 0px) + 52px)" }}
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
