"use client"

import AppConvexProvider from "@workspace/api/provider"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ThemeProvider } from "next-themes"
import { useState, type ReactNode } from "react"

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
      {BROWSER_E2E ? (
        <E2EConvexProvider>{children}</E2EConvexProvider>
      ) : (
        <AppConvexProvider>{children}</AppConvexProvider>
      )}
    </ThemeProvider>
  )
}
