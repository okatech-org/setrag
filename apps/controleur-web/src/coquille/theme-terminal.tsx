"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

import { useMaintenant } from "@/hooks/use-maintenant"
import { usePreferences } from "@/hooks/use-preferences"
import { themeVoulu } from "@/lib/preferences"

/**
 * Le thème suit l'heure (ou le choix de l'agent), le contraste suit son
 * réglage. Réévalué chaque minute : la bascule de 18:30 se fait d'elle-même,
 * en pleine tournée.
 */
export function ThemeTerminal() {
  const prefs = usePreferences()
  const maintenant = useMaintenant(60_000)
  const { setTheme } = useTheme()
  const voulu = maintenant === null ? null : themeVoulu(prefs, maintenant)

  useEffect(() => {
    if (voulu) setTheme(voulu)
  }, [setTheme, voulu])

  useEffect(() => {
    const html = document.documentElement
    if (prefs.contraste) html.setAttribute("data-contraste", "renforce")
    else html.removeAttribute("data-contraste")
  }, [prefs.contraste])

  return null
}
