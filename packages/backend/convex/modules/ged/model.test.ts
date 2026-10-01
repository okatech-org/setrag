import { describe, expect, it } from "vitest"

import {
  ajouterAnnees,
  conservationEchue,
  courrierEnRetard,
  dateIso,
  finConservation,
  motsClesNormalises,
  numeroCourrier,
  peutConsulter,
  peutModifier,
  referenceDocument,
  statutApresDecision,
  statutDocumentFinCircuit,
  validerCircuit,
  type DocumentPourDroits,
  type LecteurGed,
} from "./model"

const auteur: LecteurGed = { userId: "auteur", role: "juriste", gestionnaire: false }
const lecteur: LecteurGed = { userId: "lecteur", role: "chef_gare", gestionnaire: false }
const gestionnaire: LecteurGed = { userId: "gestion", role: "admin_fonctionnel", gestionnaire: true }

function piece(partiel: Partial<DocumentPourDroits> = {}): DocumentPourDroits {
  return {
    auteurId: "auteur",
    classification: "interne",
    statut: "valide",
    type: "rapport",
    ...partiel,
  }
}

describe("droits de consultation", () => {
  it("ouvre le public et l'interne à tout lecteur du module", () => {
    expect(peutConsulter(piece({ classification: "public" }), lecteur, [], new Set())).toBe(true)
    expect(peutConsulter(piece(), lecteur, [], new Set())).toBe(true)
  })

  it("réserve le confidentiel aux rôles désignés et aux gestionnaires", () => {
    const confidentiel = piece({ classification: "confidentiel" })
    expect(peutConsulter(confidentiel, lecteur, [], new Set())).toBe(false)
    expect(peutConsulter(confidentiel, gestionnaire, [], new Set())).toBe(true)
    expect(
      peutConsulter(confidentiel, lecteur, [{ role: "chef_gare", droit: "lecture" }], new Set())
    ).toBe(true)
    expect(peutConsulter(confidentiel, auteur, [], new Set())).toBe(true)
  })

  it("ferme le restreint même au gestionnaire, sauf désignation nominative", () => {
    const restreint = piece({ classification: "restreint" })
    expect(peutConsulter(restreint, gestionnaire, [], new Set())).toBe(false)
    expect(
      peutConsulter(restreint, lecteur, [{ role: "chef_gare", droit: "lecture" }], new Set())
    ).toBe(false)
    expect(peutConsulter(restreint, lecteur, [{ userId: "lecteur", droit: "lecture" }], new Set())).toBe(true)
    expect(peutConsulter(restreint, lecteur, [], new Set(["lecteur"]))).toBe(true)
  })

  it("ouvre une note diffusée à son audience", () => {
    const note = piece({
      classification: "confidentiel",
      type: "note_service",
      statut: "diffuse",
      diffusion: { tousLesAgents: false, roles: ["chef_gare"] },
    })
    expect(peutConsulter(note, lecteur, [], new Set())).toBe(true)
    expect(peutConsulter(note, { ...lecteur, role: "comptable" }, [], new Set())).toBe(false)
  })

  it("ne laisse modifier qu'un brouillon ou une pièce refusée", () => {
    expect(peutModifier(piece({ statut: "brouillon" }), auteur, [])).toBe(true)
    expect(peutModifier(piece({ statut: "refuse" }), auteur, [])).toBe(true)
    expect(peutModifier(piece({ statut: "valide" }), auteur, [])).toBe(false)
    expect(peutModifier(piece({ statut: "en_circuit" }), auteur, [])).toBe(false)
    expect(peutModifier(piece({ statut: "brouillon" }), lecteur, [])).toBe(false)
    expect(
      peutModifier(piece({ statut: "brouillon" }), lecteur, [{ userId: "lecteur", droit: "edition" }])
    ).toBe(true)
    expect(
      peutModifier(piece({ statut: "brouillon" }), lecteur, [{ userId: "lecteur", droit: "lecture" }])
    ).toBe(false)
  })
})

describe("circuit de validation", () => {
  const visa = { nature: "visa" as const, libelle: "Visa", assigneId: "a" }
  const signature = { nature: "signature" as const, libelle: "Signature", assigneId: "b" }
  const diffusion = { nature: "diffusion" as const, libelle: "Diffusion", assigneId: "c" }

  it("accepte visas, puis signature, puis diffusion", () => {
    expect(() => validerCircuit([visa, visa, signature, diffusion])).not.toThrow()
    expect(() => validerCircuit([signature])).not.toThrow()
  })

  it("refuse les circuits mal ordonnés", () => {
    expect(() => validerCircuit([])).toThrow("au moins une étape")
    expect(() => validerCircuit([signature, visa])).toThrow("précèdent la signature")
    expect(() => validerCircuit([visa, diffusion, signature])).toThrow("dernière étape")
    expect(() => validerCircuit([signature, signature])).toThrow("qu'une signature")
    expect(() => validerCircuit([diffusion])).toThrow("suit au moins")
    expect(() => validerCircuit(Array.from({ length: 9 }, () => visa))).toThrow("8 étapes")
  })

  it("associe chaque décision à la nature de l'étape", () => {
    expect(statutApresDecision("visa", "viser")).toBe("vise")
    expect(statutApresDecision("signature", "signer")).toBe("signe")
    expect(statutApresDecision("diffusion", "diffuser")).toBe("diffuse")
    expect(statutApresDecision("visa", "refuser")).toBe("refuse")
    expect(() => statutApresDecision("visa", "signer")).toThrow()
    expect(() => statutApresDecision("diffusion", "refuser")).toThrow("ne se refuse pas")
    expect(statutDocumentFinCircuit("diffusion")).toBe("diffuse")
    expect(statutDocumentFinCircuit("signature")).toBe("valide")
  })
})

describe("numérotation, dates et conservation", () => {
  it("formate les références et numéros chronologiques", () => {
    expect(referenceDocument(2026, 42)).toBe("GED-2026-000042")
    expect(numeroCourrier("arrivee", 2026, 7)).toBe("A-2026-00007")
    expect(numeroCourrier("depart", 2026, 12345)).toBe("D-2026-12345")
  })

  it("valide les dates réelles", () => {
    expect(dateIso("2026-02-28", "La date")).toBe("2026-02-28")
    expect(() => dateIso("2026-02-30", "La date")).toThrow("pas une date valide")
    expect(() => dateIso("01/10/2026", "La date")).toThrow("AAAA-MM-JJ")
  })

  it("calcule la fin de conservation et son échéance", () => {
    expect(finConservation("2016-03-15", 10)).toBe("2026-03-15")
    expect(finConservation("2016-03-15", null)).toBeNull()
    expect(ajouterAnnees("2024-02-29", 1)).toBe("2025-02-28")
    expect(conservationEchue("2026-03-15", "2026-10-01")).toBe(true)
    expect(conservationEchue("2030-03-15", "2026-10-01")).toBe(false)
    expect(conservationEchue(undefined, "2026-10-01")).toBe(false)
  })

  it("normalise les mots-clés", () => {
    expect(motsClesNormalises(["  Voie ", "voie", "Lopé", ""])).toEqual(["voie", "lopé"])
    expect(() => motsClesNormalises(Array.from({ length: 13 }, (_, i) => `m${i}`))).toThrow("Douze")
  })

  it("repère un courrier arrivé non répondu après son échéance", () => {
    const base = { sens: "arrivee" as const, statut: "enregistre", echeanceReponse: "2026-09-20" }
    expect(courrierEnRetard(base, "2026-10-01")).toBe(true)
    expect(courrierEnRetard({ ...base, statut: "repondu" }, "2026-10-01")).toBe(false)
    expect(courrierEnRetard({ ...base, sens: "depart" }, "2026-10-01")).toBe(false)
    expect(courrierEnRetard(base, "2026-09-19")).toBe(false)
  })
})
