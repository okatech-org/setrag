import { describe, expect, it } from "vitest"
import { demandeCoupeEtendue, texteImprimable } from "./polices"

/**
 * Le filet de sécurité typographique : ce que le PDF imprime réellement pour
 * un texte donné, avec les polices de la charte.
 */
describe("texte imprimable", () => {
  it("laisse intacts les accents français et la ponctuation typographique", () => {
    for (const style of ["texte", "demi", "mono"] as const) {
      expect(texteImprimable(style, "Paul-Émile MBADINGA à Ndjolé")).toBe(
        "Paul-Émile MBADINGA à Ndjolé",
      )
      expect(texteImprimable(style, "Owendo — Franceville « aller » l’œuvre…")).toBe(
        "Owendo — Franceville « aller » l’œuvre…",
      )
    }
  })

  it("imprime le Latin étendu tel quel, sans translittérer", () => {
    // La coupe « Latin étendu » de Schibsted Grotesk et d'IBM Plex Mono
    // connaît ces lettres : plus besoin de perdre l'accent d'un nom.
    expect(texteImprimable("demi", "Łukasz Şahin Ăurel Őrs")).toBe(
      "Łukasz Şahin Ăurel Őrs",
    )
    expect(texteImprimable("mono", "Łukasz")).toBe("Łukasz")
  })

  it("retire l'accent qu'aucune coupe ne connaît, plutôt que la lettre", () => {
    // Les lettres vietnamiennes à double accent sont hors des deux coupes.
    expect(texteImprimable("demi", "Nguyễn Thị")).toBe("Nguyen Thi")
    // Un signe diacritique isolé tombe, la lettre reste.
    expect(texteImprimable("demi", "x\u0302y")).toBe("xy")
  })

  it("remplace par « ? » ce qu'aucune police ne sait dessiner", () => {
    expect(texteImprimable("demi", "李小龍")).toBe("???")
    // Caractères de commande : rien d'imprimable.
    expect(texteImprimable("demi", "OWE\u0000\u0001 FCV")).toBe("OWE?? FCV")
  })

  it("garde l'espace insécable des montants", () => {
    expect(texteImprimable("monoDemi", "38\u00A0500\u00A0FCFA")).toBe(
      "38\u00A0500\u00A0FCFA",
    )
  })
})

describe("coupe étendue", () => {
  it("n'est demandée que si un texte l'exige", () => {
    expect(demandeCoupeEtendue(["demi"], ["Paul-Émile", "Ndjolé"])).toBe(false)
    expect(demandeCoupeEtendue(["demi"], ["Łukasz"])).toBe(true)
    // Ni le vietnamien ni les idéogrammes n'y figurent : inutile de l'embarquer.
    expect(demandeCoupeEtendue(["demi"], ["Nguyễn", "李"])).toBe(false)
  })
})
