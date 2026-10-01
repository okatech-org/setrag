"use client"

import AppConvexProvider from "@workspace/api/provider"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AppConvexProvider>{children}</AppConvexProvider>
    </ThemeProvider>
  )
}
