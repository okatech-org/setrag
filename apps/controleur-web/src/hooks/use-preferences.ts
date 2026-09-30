"use client"

import { useSyncExternalStore } from "react"

import {
  abonnerPreferences,
  preferences,
  PREFERENCES_PAR_DEFAUT,
  type Preferences,
} from "@/lib/preferences"

/** Réglages d'affichage du terminal, relus à chaque modification. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(
    abonnerPreferences,
    preferences,
    () => PREFERENCES_PAR_DEFAUT
  )
}
