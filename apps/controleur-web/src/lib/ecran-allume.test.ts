import { describe, expect, it, vi } from "vitest"

import {
  creerGardeEcran,
  ecranAllumeVoulu,
  type EnvironnementEcran,
  type VerrouEcran,
} from "./ecran-allume"

/** Laisse passer les promesses en attente. */
const attendre = () => new Promise((resolve) => setTimeout(resolve, 0))

type VerrouSimule = VerrouEcran & {
  release: ReturnType<typeof vi.fn>
  /** Le navigateur reprend le verrou : onglet caché, écran éteint. */
  repris: () => void
}

/** Navigateur simulé : `navigator.wakeLock` et la visibilité de la page. */
function simuler(
  options: {
    sansApi?: boolean
    refus?: boolean
    visible?: boolean
    reponse?: () => Promise<VerrouEcran>
  } = {}
) {
  const verrous: VerrouSimule[] = []
  const page = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState
  }
  page.visibilityState = options.visible === false ? "hidden" : "visible"

  function nouveauVerrou(): VerrouSimule {
    const ecouteurs: Array<() => void> = []
    const verrou: VerrouSimule = {
      released: false,
      release: vi.fn(async () => verrou.repris()),
      addEventListener: (_type, ecouteur) => void ecouteurs.push(ecouteur),
      repris: () => {
        if (verrou.released) return
        ;(verrou as { released: boolean }).released = true
        for (const ecouteur of ecouteurs) ecouteur()
      },
    }
    verrous.push(verrou)
    return verrou
  }

  const request = vi.fn(async (): Promise<VerrouEcran> => {
    if (options.refus) {
      throw new DOMException("Économie d'énergie", "NotAllowedError")
    }
    return options.reponse ? options.reponse() : nouveauVerrou()
  })

  const env: EnvironnementEcran = {
    wakeLock: options.sansApi ? undefined : { request },
    document: page as unknown as EnvironnementEcran["document"],
  }
  return {
    env,
    request,
    verrous,
    nouveauVerrou,
    cacher() {
      page.visibilityState = "hidden"
      // Le navigateur rend le verrou de lui-même quand la page se cache.
      for (const verrou of verrous) verrou.repris()
      page.dispatchEvent(new Event("visibilitychange"))
    },
    montrer() {
      page.visibilityState = "visible"
      page.dispatchEvent(new Event("visibilitychange"))
    },
  }
}

describe("Écran allumé pendant le contrôle", () => {
  it("demande l'écran allumé en tournée", async () => {
    const nav = simuler()
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    expect(nav.request).toHaveBeenCalledWith("screen")
    expect(garde.tenu).toBe(true)
  })

  it("le rend en fin de tournée ou au verrouillage du terminal", async () => {
    const nav = simuler()
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    garde.vouloir(false)
    expect(nav.verrous[0]!.release).toHaveBeenCalledOnce()
    expect(garde.tenu).toBe(false)
  })

  it("le redemande au retour de visibilité, le navigateur l'ayant rendu", async () => {
    const nav = simuler()
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()

    nav.cacher()
    await attendre()
    expect(garde.tenu).toBe(false)
    // Rien n'est demandé tant que la page est cachée : ce serait refusé.
    expect(nav.request).toHaveBeenCalledTimes(1)

    nav.montrer()
    await attendre()
    expect(nav.request).toHaveBeenCalledTimes(2)
    expect(garde.tenu).toBe(true)
  })

  it("attend que la page soit visible pour demander", async () => {
    const nav = simuler({ visible: false })
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    expect(nav.request).not.toHaveBeenCalled()

    nav.montrer()
    await attendre()
    expect(garde.tenu).toBe(true)
  })

  it("ne redemande rien au retour de visibilité hors tournée", async () => {
    const nav = simuler()
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    garde.vouloir(false)
    nav.cacher()
    nav.montrer()
    await attendre()
    expect(nav.request).toHaveBeenCalledTimes(1)
  })

  it("se replie sans bruit quand l'API manque", async () => {
    const nav = simuler({ sansApi: true })
    const garde = creerGardeEcran(nav.env)
    expect(() => garde.vouloir(true)).not.toThrow()
    nav.montrer()
    await attendre()
    expect(garde.tenu).toBe(false)
  })

  it("se replie sans bruit quand la demande est refusée", async () => {
    const nav = simuler({ refus: true })
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    expect(nav.request).toHaveBeenCalledOnce()
    expect(garde.tenu).toBe(false)
  })

  it("rend aussitôt un verrou accordé après la fin de tournée", async () => {
    let accorder: (verrou: VerrouEcran) => void = () => {}
    const nav = simuler({
      reponse: () => new Promise((resolve) => (accorder = resolve)),
    })
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    garde.vouloir(false)

    const tardif = nav.nouveauVerrou()
    accorder(tardif)
    await attendre()
    expect(tardif.release).toHaveBeenCalledOnce()
    expect(garde.tenu).toBe(false)
  })

  it("cesse d'écouter la page une fois arrêtée", async () => {
    const nav = simuler()
    const garde = creerGardeEcran(nav.env)
    garde.vouloir(true)
    await attendre()
    garde.arreter()
    expect(nav.verrous[0]!.release).toHaveBeenCalledOnce()

    nav.montrer()
    await attendre()
    expect(nav.request).toHaveBeenCalledOnce()
  })
})

describe("Quand garder l'écran allumé", () => {
  const enTournee = { reglage: true, enTournee: true }

  it("sur les écrans de la tournée : tournée, viseur, verdicts, vente, PV", () => {
    for (const chemin of [
      "/tournee",
      "/scan",
      "/recherche",
      "/voiture",
      "/vente",
      "/pv",
    ]) {
      expect(ecranAllumeVoulu({ ...enTournee, chemin })).toBe(true)
    }
  })

  it("pas ailleurs, ni hors tournée, ni réglage coupé", () => {
    expect(ecranAllumeVoulu({ ...enTournee, chemin: "/historique" })).toBe(
      false
    )
    expect(
      ecranAllumeVoulu({ reglage: true, enTournee: false, chemin: "/scan" })
    ).toBe(false)
    expect(
      ecranAllumeVoulu({ reglage: false, enTournee: true, chemin: "/scan" })
    ).toBe(false)
  })
})
