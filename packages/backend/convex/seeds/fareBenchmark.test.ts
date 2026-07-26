import { describe, expect, it } from "vitest"
import { compareFaresToPublished } from "./referential"

/**
 * Rapprochement du barème du CDC avec les tarifs affichés.
 *
 * Ces tests ne vérifient pas un calcul : ils FIGENT un constat. Le barème de
 * l'annexe 2 produit des prix nettement inférieurs à ceux que SETRAG pratique.
 * Tant que le client n'a pas tranché, l'écart doit rester visible — s'il
 * disparaît un jour, c'est que quelqu'un a touché au barème, et on veut le
 * savoir.
 */

const DISTANCE_TOTALE = 669

describe("barème du CDC face aux tarifs affichés", () => {
  it("couvre les cinq combinaisons dont le tarif public est connu", () => {
    const ecarts = compareFaresToPublished(DISTANCE_TOTALE)
    expect(ecarts.map((e) => e.label)).toEqual([
      "EXPRESS/VIP",
      "EXPRESS/PREMIERE",
      "EXPRESS/DEUXIEME",
      "OMNIBUS/PREMIERE",
      "OMNIBUS/DEUXIEME",
    ])
  })

  it("produit systématiquement des prix inférieurs aux tarifs pratiqués", () => {
    for (const e of compareFaresToPublished(DISTANCE_TOTALE)) {
      expect(e.gapPct).toBeLessThan(0)
    }
  })

  it("situe l'écart entre 25 % et 45 %, sans exception", () => {
    // Une fourchette plutôt qu'une valeur exacte : le constat porte sur
    // l'ordre de grandeur, et il ne doit pas casser au premier arrondi.
    for (const e of compareFaresToPublished(DISTANCE_TOTALE)) {
      expect(Math.abs(e.gapPct)).toBeGreaterThanOrEqual(25)
      expect(Math.abs(e.gapPct)).toBeLessThanOrEqual(45)
    }
  })

  it("l'écart est régulier : c'est ce qui suggère un barème daté", () => {
    // Un barème simplement mal transcrit donnerait des écarts dispersés.
    // Une révision tarifaire non répercutée les rend homogènes.
    const ecarts = compareFaresToPublished(DISTANCE_TOTALE).map((e) =>
      Math.abs(e.gapPct),
    )
    const amplitude = Math.max(...ecarts) - Math.min(...ecarts)
    expect(amplitude).toBeLessThanOrEqual(15)
  })

  it("le rapprochement suit la distance", () => {
    const court = compareFaresToPublished(100)
    const long = compareFaresToPublished(DISTANCE_TOTALE)
    // Sur une distance plus courte, le prix calculé s'éloigne encore du
    // tarif de bout en bout : la comparaison n'a de sens qu'à pleine ligne.
    expect(court[0]!.cdcXaf).toBeLessThan(long[0]!.cdcXaf)
  })
})
