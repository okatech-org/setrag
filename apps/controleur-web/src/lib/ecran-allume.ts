/**
 * Garder l'écran allumé pendant le contrôle — API Screen Wake Lock.
 *
 * Entre deux voyageurs, le téléphone se met en veille ; le rallumer, puis
 * déverrouiller le système, coûte plusieurs secondes à chaque titre. Pendant
 * une tournée active, le terminal demande donc à garder l'écran allumé.
 *
 * Trois règles :
 *
 *  — le navigateur rend le verrou dès que l'onglet est caché (écran éteint au
 *    bouton, autre application) : il est redemandé au retour de visibilité ;
 *  — il est rendu au verrouillage du terminal et en fin de tournée, ou quand
 *    l'agent coupe le réglage ;
 *  — sans l'API (navigateur ancien, iOS avant 16.4), ou si la demande est
 *    refusée (mode économie d'énergie), on se replie sans bruit : l'écran se
 *    met simplement en veille, comme avant.
 */

/** Verrou rendu par `navigator.wakeLock.request("screen")`. */
export interface VerrouEcran {
  readonly released: boolean
  release(): Promise<void>
  addEventListener(type: "release", ecouteur: () => void): void
}

/** Ce que le module attend du navigateur — injecté, pour les tests. */
export interface EnvironnementEcran {
  wakeLock?: { request(type: "screen"): Promise<VerrouEcran> }
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >
}

export interface GardeEcran {
  /** Demande l'écran allumé (`true`) ou le rend (`false`). */
  vouloir(actif: boolean): void
  /** Vrai tant qu'un verrou est effectivement tenu. */
  readonly tenu: boolean
  /** Rend le verrou et cesse d'écouter la visibilité de la page. */
  arreter(): void
}

function environnementNavigateur(): EnvironnementEcran {
  const api =
    typeof navigator !== "undefined" && "wakeLock" in navigator
      ? (navigator.wakeLock as EnvironnementEcran["wakeLock"])
      : undefined
  return { wakeLock: api, document }
}

function rendreSansBruit(verrou: VerrouEcran): void {
  if (verrou.released) return
  verrou.release().catch(() => {
    // Déjà rendu par le navigateur : rien à faire.
  })
}

export function creerGardeEcran(
  env: EnvironnementEcran = environnementNavigateur()
): GardeEcran {
  let voulu = false
  let verrou: VerrouEcran | null = null
  let enDemande = false

  function acquerir(): void {
    const api = env.wakeLock
    if (!api || !voulu || verrou || enDemande) return
    // Une demande faite onglet caché est refusée : on attend son retour.
    if (env.document.visibilityState !== "visible") return

    enDemande = true
    let demande: Promise<VerrouEcran>
    try {
      demande = api.request("screen")
    } catch {
      enDemande = false
      return
    }
    demande.then(
      (obtenu) => {
        enDemande = false
        // Rendu entre la demande et la réponse : on ne garde rien.
        if (!voulu) {
          rendreSansBruit(obtenu)
          return
        }
        verrou = obtenu
        obtenu.addEventListener("release", () => {
          if (verrou === obtenu) verrou = null
        })
      },
      () => {
        // Refusé (économie d'énergie, politique du navigateur) : sans bruit.
        enDemande = false
      }
    )
  }

  function rendre(): void {
    const tenu = verrou
    verrou = null
    if (tenu) rendreSansBruit(tenu)
  }

  const surVisibilite = () => {
    if (env.document.visibilityState === "visible") acquerir()
  }
  env.document.addEventListener("visibilitychange", surVisibilite)

  return {
    vouloir(actif) {
      voulu = actif
      if (actif) acquerir()
      else rendre()
    },
    get tenu() {
      return verrou !== null
    },
    arreter() {
      voulu = false
      rendre()
      env.document.removeEventListener("visibilitychange", surVisibilite)
    },
  }
}

/**
 * Écrans d'une tournée active : la tournée, le viseur, la recherche et la
 * voiture (qui rendent des verdicts), la vente à bord et le procès-verbal.
 * Ailleurs — historique, incident, données embarquées —, la veille reprend.
 */
export const ECRANS_DE_TOURNEE: readonly string[] = [
  "/tournee",
  "/scan",
  "/recherche",
  "/voiture",
  "/vente",
  "/pv",
]

/** Faut-il garder l'écran allumé, ici et maintenant ? */
export function ecranAllumeVoulu(etat: {
  /** Réglage « Garder l'écran allumé pendant le contrôle ». */
  reglage: boolean
  /** Un manifeste est embarqué : la tournée est en cours. */
  enTournee: boolean
  chemin: string
}): boolean {
  return (
    etat.reglage && etat.enTournee && ECRANS_DE_TOURNEE.includes(etat.chemin)
  )
}
