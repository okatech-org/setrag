"use client"

import { MoonIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useSyncExternalStore } from "react"

import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { Feuille } from "@workspace/ui/components/feuille"

import { Ligne } from "./elements"

const THEMES = [
  { value: "system", label: "Automatique, comme l'appareil" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
] as const

const LIBELLES: Record<string, string> = {
  system: "Automatique",
  light: "Clair",
  dark: "Sombre",
}

const pasDAbonnement = () => () => {}

/**
 * Le thème choisi. Il vit dans le navigateur (next-themes), pas dans le
 * compte : il se règle sans être connecté, et reste propre à l'appareil.
 * Inconnu au rendu serveur, il ne s'affiche qu'une fois la page montée.
 */
export function useThemeChoisi() {
  const { theme, setTheme } = useTheme()
  const monte = useSyncExternalStore(
    pasDAbonnement,
    () => true,
    () => false
  )
  return { theme: monte ? (theme ?? "system") : undefined, setTheme }
}

/** Les trois choix, en boutons radio : chacun s'applique aussitôt. */
export function ChoixTheme() {
  const { theme, setTheme } = useThemeChoisi()
  return (
    <RadioGroup
      value={theme}
      onValueChange={setTheme}
      aria-label="Thème de l'affichage"
      className="gap-0"
    >
      {THEMES.map((option) => (
        <Radio
          key={option.value}
          value={option.value}
          label={option.label}
          className="min-h-12"
        />
      ))}
    </RadioGroup>
  )
}

/** Ligne « Affichage » de l'écran Compte : le thème courant, et sa feuille de choix. */
export function LigneAffichage() {
  const { theme } = useThemeChoisi()
  const [ouverte, setOuverte] = useState(false)
  return (
    <>
      <Ligne
        icone={MoonIcon}
        libelle="Affichage"
        fin={theme ? LIBELLES[theme] : undefined}
        onClick={() => setOuverte(true)}
      />
      <Feuille
        open={ouverte}
        onOpenChange={setOuverte}
        titre="Affichage"
        description="Le thème ne vaut que pour cet appareil."
      >
        <ChoixTheme />
      </Feuille>
    </>
  )
}
