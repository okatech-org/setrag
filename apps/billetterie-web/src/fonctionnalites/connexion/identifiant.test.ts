import { describe, expect, it } from "vitest"

import {
  cheminDeRetour,
  ecritureNationale,
  emailValide,
  messageErreur,
} from "./identifiant"

describe("cheminDeRetour", () => {
  it("garde un chemin du site, avec sa requête", () => {
    expect(cheminDeRetour("/paiement?vente=STG-7K4Q2P")).toBe(
      "/paiement?vente=STG-7K4Q2P"
    )
    expect(cheminDeRetour("/compte/voyageurs")).toBe("/compte/voyageurs")
  })

  it("renvoie vers les billets sans demande", () => {
    expect(cheminDeRetour(null)).toBe("/billets")
    expect(cheminDeRetour("")).toBe("/billets")
  })

  it("refuse toute autre origine", () => {
    expect(cheminDeRetour("https://exemple.com")).toBe("/billets")
    expect(cheminDeRetour("//exemple.com")).toBe("/billets")
    expect(cheminDeRetour("/\\exemple.com")).toBe("/billets")
    expect(cheminDeRetour("/\t/exemple.com")).toBe("/billets")
    expect(cheminDeRetour("javascript:alert(1)")).toBe("/billets")
  })

  it("ne revient jamais sur la connexion", () => {
    expect(cheminDeRetour("/connexion")).toBe("/billets")
    expect(cheminDeRetour("/connexion?retour=/compte")).toBe("/billets")
  })
})

describe("numéro de téléphone", () => {
  it("réécrit un numéro gabonais enregistré sur 9 chiffres", () => {
    expect(ecritureNationale("+24177123456")).toBe("077 12 34 56")
  })

  it("laisse un numéro étranger tel quel", () => {
    expect(ecritureNationale("+33612345678")).toBe("+33612345678")
    expect(ecritureNationale(undefined)).toBe("")
  })
})

describe("adresse e-mail", () => {
  it("demande un domaine", () => {
    expect(emailValide("nadia@exemple.ga")).toBe(true)
    expect(emailValide("nadia@exemple")).toBe(false)
  })
})

describe("messageErreur", () => {
  it("annonce les essais restants", () => {
    expect(
      messageErreur(
        { code: "INVALID_OTP" },
        { etape: "verification", canal: "telephone", essaisRestants: 2 }
      )
    ).toBe("Ce code ne correspond pas. Il vous reste 2 essais.")
    expect(
      messageErreur(
        { code: "INVALID_OTP" },
        { etape: "verification", canal: "telephone", essaisRestants: 0 }
      )
    ).toBe("Ce code ne correspond pas. Demandez un nouveau code.")
  })

  it("traduit la limite de débit", () => {
    expect(
      messageErreur({ status: 429 }, { etape: "envoi", canal: "email" })
    ).toMatch(/Patientez une minute/)
  })
})
