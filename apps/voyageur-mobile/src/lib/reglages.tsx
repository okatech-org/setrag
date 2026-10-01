import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Appearance } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"

import type { MoyenPaiement } from "./journey"

export type Theme = "automatique" | "clair" | "sombre"

/** Moyen de paiement préféré : gardé sur ce téléphone, jamais envoyé. */
export type MoyenPrefere = { moyen: MoyenPaiement; numero?: string; carte?: "visa" | "mastercard" }

type Reglages = {
  pret: boolean
  bienvenueVue: boolean
  marquerBienvenueVue: () => Promise<void>
  theme: Theme
  choisirTheme: (theme: Theme) => Promise<void>
  moyenPrefere: MoyenPrefere | null
  choisirMoyen: (moyen: MoyenPrefere) => Promise<void>
  /** Bulle « Bonjour, je suis Ruban » : montrée une fois. */
  bulleRubanVue: boolean
  marquerBulleRubanVue: () => Promise<void>
}

const CLE = "setrag:reglages:v1"
const Contexte = createContext<Reglages | null>(null)

type Stocke = { bienvenueVue?: boolean; theme?: Theme; moyenPrefere?: MoyenPrefere; bulleRubanVue?: boolean }

function appliquerTheme(theme: Theme) {
  Appearance.setColorScheme(theme === "clair" ? "light" : theme === "sombre" ? "dark" : "unspecified")
}

export function ReglagesProvider({ children }: { children: ReactNode }) {
  const [pret, setPret] = useState(false)
  const [stocke, setStocke] = useState<Stocke>({})
  const courant = useRef<Stocke>({})

  useEffect(() => {
    let actif = true
    AsyncStorage.getItem(CLE)
      .then((brut) => {
        if (!actif) return
        const lu = brut ? (JSON.parse(brut) as Stocke) : {}
        if (lu.theme) appliquerTheme(lu.theme)
        courant.current = lu
        setStocke(lu)
      })
      .catch(() => undefined)
      .finally(() => actif && setPret(true))
    return () => {
      actif = false
    }
  }, [])

  const ecrire = useCallback(async (patch: Stocke) => {
    const suivant = { ...courant.current, ...patch }
    courant.current = suivant
    setStocke(suivant)
    await AsyncStorage.setItem(CLE, JSON.stringify(suivant))
  }, [])

  const valeur = useMemo<Reglages>(
    () => ({
      pret,
      bienvenueVue: stocke.bienvenueVue ?? false,
      marquerBienvenueVue: () => ecrire({ bienvenueVue: true }),
      theme: stocke.theme ?? "automatique",
      choisirTheme: async (theme) => {
        appliquerTheme(theme)
        await ecrire({ theme })
      },
      moyenPrefere: stocke.moyenPrefere ?? null,
      choisirMoyen: (moyenPrefere) => ecrire({ moyenPrefere }),
      bulleRubanVue: stocke.bulleRubanVue ?? false,
      marquerBulleRubanVue: () => ecrire({ bulleRubanVue: true }),
    }),
    [pret, stocke, ecrire],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useReglages() {
  const valeur = useContext(Contexte)
  if (!valeur) throw new Error("ReglagesProvider manquant")
  return valeur
}
