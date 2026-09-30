import { describe, expect, it } from "vitest"

import {
  aPayer,
  codeAffichable,
  estAVenir,
  statutVente,
  type Dossier,
  type Titre,
} from "./dossier"
import { variantesTelephone } from "./retrouver-reservation"

const H = 3_600_000
const MAINTENANT = Date.UTC(2026, 8, 30, 10)

function dossier(
  vente: Partial<Dossier["sale"]>,
  trajet: Partial<NonNullable<Dossier["trip"]>> = {}
): Dossier {
  return {
    sale: { status: "confirmee", number: "V-1", ...vente },
    trip: {
      departureAt: MAINTENANT + 24 * H,
      arrivalAt: MAINTENANT + 30 * H,
      delayMinutes: 0,
      status: "planifie",
      ...trajet,
    },
    tickets: [],
  } as unknown as Dossier
}

describe("dossier", () => {
  it("range un voyage payé à venir, puis dans l'historique une fois arrivé", () => {
    expect(estAVenir(dossier({}), MAINTENANT)).toBe(true)
    expect(estAVenir(dossier({}), MAINTENANT + 31 * H)).toBe(false)
    expect(statutVente(dossier({}), MAINTENANT + 31 * H).libelle).toBe(
      "Voyage effectué"
    )
  })

  it("tient compte du retard pour dire si le train est arrivé", () => {
    const enRetard = dossier({}, { delayMinutes: 90 })
    expect(estAVenir(enRetard, MAINTENANT + 31 * H)).toBe(true)
  })

  it("ne propose plus de payer une fois la tenue écoulée", () => {
    const option = dossier({
      status: "en_attente_paiement",
      priceLockedUntil: MAINTENANT + 60_000,
    })
    expect(aPayer(option, MAINTENANT)).toBe(true)
    expect(aPayer(option, MAINTENANT + 120_000)).toBe(false)
    expect(estAVenir(option, MAINTENANT + 120_000)).toBe(false)
    expect(statutVente(option, MAINTENANT + 120_000).libelle).toBe(
      "Délai de paiement écoulé"
    )
  })

  it("ne montre le code que d'un titre émis", () => {
    const titre = (status: string) =>
      ({ status, barcodePayload: "SETRAG1:X" }) as unknown as Titre
    expect(codeAffichable(titre("valide"))).toBe("SETRAG1:X")
    expect(codeAffichable(titre("utilise"))).toBe("SETRAG1:X")
    expect(codeAffichable(titre("en_attente"))).toBeUndefined()
    expect(codeAffichable(titre("annule"))).toBeUndefined()
  })
})

describe("variantesTelephone", () => {
  it("essaie d'abord la forme enregistrée par le tunnel, puis la saisie", () => {
    expect(variantesTelephone("077 12 34 56")).toEqual([
      "+24177123456",
      "077 12 34 56",
      "077123456",
    ])
    expect(variantesTelephone("+24177123456")).toEqual(["+24177123456"])
  })
})
