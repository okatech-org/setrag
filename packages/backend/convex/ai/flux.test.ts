import { describe, expect, it } from "vitest"
import { INTERVALLE_FLUX_MS, RegroupeurFlux } from "./flux"

/** Horloge manipulée par le test. */
function horloge(depart = 1_000) {
  let maintenant = depart
  return {
    maintenant: () => maintenant,
    avancer: (ms: number) => {
      maintenant += ms
    },
  }
}

describe("regroupement des écritures du flux", () => {
  it("écrit le premier morceau tout de suite, puis au plus toutes les 200 ms", async () => {
    const temps = horloge()
    const ecrits: string[] = []
    const flux = new RegroupeurFlux({
      ecrire: async (texte) => {
        ecrits.push(texte)
      },
      maintenant: temps.maintenant,
    })

    await flux.ajouter("Bonjour")
    expect(ecrits).toEqual(["Bonjour"])

    // Trente morceaux arrivés en 150 ms : aucun ne déclenche d'écriture.
    for (let index = 0; index < 30; index += 1) {
      temps.avancer(5)
      await flux.ajouter(".")
    }
    expect(ecrits).toHaveLength(1)

    temps.avancer(INTERVALLE_FLUX_MS)
    await flux.ajouter(" Ariane")
    expect(ecrits).toHaveLength(2)
    // Chaque écriture porte le texte entier : rien ne se perd entre deux.
    expect(ecrits[1]).toBe(`Bonjour${".".repeat(30)} Ariane`)

    temps.avancer(10)
    await flux.ajouter(" !")
    await flux.vider()
    expect(ecrits[ecrits.length - 1]).toBe(flux.texte())
    expect(flux.ecritures()).toBe(3)

    // Rien de neuf : vider n'écrit pas deux fois la même chose.
    await flux.vider()
    expect(flux.ecritures()).toBe(3)
  })

  it("borne le nombre de mutations d'une longue réponse", async () => {
    const temps = horloge()
    let ecritures = 0
    const flux = new RegroupeurFlux({
      ecrire: async () => {
        ecritures += 1
      },
      maintenant: temps.maintenant,
    })
    // 600 morceaux, un toutes les 10 ms : six secondes de texte.
    for (let index = 0; index < 600; index += 1) {
      await flux.ajouter("mot ")
      temps.avancer(10)
    }
    await flux.vider()
    // Une écriture tous les 200 ms environ, jamais une par morceau.
    expect(ecritures).toBeLessThanOrEqual(6_000 / INTERVALLE_FLUX_MS + 2)
    expect(ecritures).toBeGreaterThanOrEqual(6_000 / INTERVALLE_FLUX_MS - 2)
    expect(flux.texte()).toBe("mot ".repeat(600))
  })

  it("sépare les textes de deux étapes par une ligne vide, seulement s'il y en a", async () => {
    const flux = new RegroupeurFlux({ ecrire: async () => undefined })
    flux.nouvelleEtape()
    await flux.ajouter("Je cherche vos trains.")
    flux.nouvelleEtape()
    // Une étape sans texte (appel d'outil seul) n'ajoute rien.
    flux.nouvelleEtape()
    await flux.ajouter("L'Express 201 part à 07:40.")
    expect(flux.texte()).toBe(
      "Je cherche vos trains.\n\nL'Express 201 part à 07:40."
    )
  })

  it("n'écrit rien en route pour une messagerie, qui n'envoie que le message final", async () => {
    let ecritures = 0
    const flux = new RegroupeurFlux({
      ecrire: async () => {
        ecritures += 1
      },
      diffuser: false,
    })
    await flux.ajouter("Bonjour")
    await flux.ajouter(" Ariane")
    await flux.vider()
    expect(ecritures).toBe(0)
    expect(flux.texte()).toBe("Bonjour Ariane")
  })
})
