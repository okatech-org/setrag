import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLE_PREFERENCES,
  estNuit,
  PREFERENCES_PAR_DEFAUT,
  themeVoulu,
} from "./preferences"

/** Un instant donné à l'heure de Libreville (UTC+1, sans heure d'été). */
const a = (hhmm: string) => Date.parse(`2026-09-30T${hhmm}:00+01:00`)

describe("Thème de nuit", () => {
  it("bascule en sombre de 18:30 à 06:00 par défaut, à l'heure de Libreville", () => {
    const { nuitDebut, nuitFin } = PREFERENCES_PAR_DEFAUT
    expect(estNuit(a("18:29"), nuitDebut, nuitFin)).toBe(false)
    expect(estNuit(a("18:30"), nuitDebut, nuitFin)).toBe(true)
    expect(estNuit(a("00:34"), nuitDebut, nuitFin)).toBe(true)
    expect(estNuit(a("05:59"), nuitDebut, nuitFin)).toBe(true)
    expect(estNuit(a("06:00"), nuitDebut, nuitFin)).toBe(false)
    expect(estNuit(a("15:54"), nuitDebut, nuitFin)).toBe(false)
  })

  it("accepte une plage qui n'enjambe pas minuit", () => {
    expect(estNuit(a("22:30"), "22:00", "23:30")).toBe(true)
    expect(estNuit(a("23:45"), "22:00", "23:30")).toBe(false)
  })

  it("laisse l'agent forcer le clair ou le sombre", () => {
    const nuit = a("00:34")
    expect(themeVoulu({ ...PREFERENCES_PAR_DEFAUT }, nuit)).toBe("dark")
    expect(
      themeVoulu({ ...PREFERENCES_PAR_DEFAUT, theme: "clair" }, nuit)
    ).toBe("light")
    expect(
      themeVoulu({ ...PREFERENCES_PAR_DEFAUT, theme: "sombre" }, a("12:00"))
    ).toBe("dark")
  })
})

/** Stockage en mémoire : Node expose un `localStorage` inerte sous jsdom. */
function stockage(): Storage {
  const valeurs = new Map<string, string>()
  return {
    get length() {
      return valeurs.size
    },
    clear: () => valeurs.clear(),
    getItem: (cle) => valeurs.get(cle) ?? null,
    key: (i) => [...valeurs.keys()][i] ?? null,
    removeItem: (cle) => void valeurs.delete(cle),
    setItem: (cle, valeur) => void valeurs.set(cle, String(valeur)),
  }
}

describe("Réglages persistants", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal("localStorage", stockage())
  })

  it("rejette une heure mal formée et garde la valeur par défaut", async () => {
    localStorage.setItem(
      CLE_PREFERENCES,
      JSON.stringify({ nuitDebut: "25:00", son: false })
    )
    const { preferences } = await import("./preferences")
    expect(preferences()).toMatchObject({
      nuitDebut: "18:30",
      son: false,
      theme: "auto",
    })
  })

  it("enregistre une modification et prévient les abonnés", async () => {
    const { abonnerPreferences, modifierPreferences, preferences } =
      await import("./preferences")
    const rappel = vi.fn()
    const fin = abonnerPreferences(rappel)
    modifierPreferences({ contraste: true })
    expect(rappel).toHaveBeenCalledOnce()
    expect(preferences().contraste).toBe(true)
    expect(JSON.parse(localStorage.getItem(CLE_PREFERENCES)!)).toMatchObject({
      contraste: true,
    })
    fin()
  })
})
