/**
 * Le bandeau de service, sous la barre d'état : réseau, file d'envoi et heure
 * de la dernière confirmation, sur chaque écran.
 *
 * Hors ligne est le régime normal en pleine voie, pas une panne : le bandeau
 * le dit sans alarme. Son état s'écrit toujours en toutes lettres ; la
 * couleur n'est qu'un renfort.
 */

import { heure } from "./format"

export type TonBandeau =
  "en-ligne" | "hors-ligne" | "envoi" | "session" | "echec"

export interface EtatBandeau {
  ton: TonBandeau
  /** Le mot en gras : « Hors ligne », « Envoi », « 2 en échec ». */
  titre: string
  /** La suite : « rien à envoyer », « 2 sur 9 », « conservés ». */
  detail?: string
  /** Nombre à envoyer, en pastille, à la place du détail chiffré. */
  compte?: number
  /** À droite : « synchro 11:52 », « lot 3 sur 4 », « reprise auto. ». */
  fin?: string
}

export interface EntreeBandeau {
  online: boolean
  authenticated: boolean
  syncing: boolean
  progress: {
    sent: number
    total: number
    batch: number
    batchCount: number
  } | null
  queue: { total: number; failed: number }
  lastSyncAt?: number
  /** Prochaine reprise automatique après un échec. */
  nextRetryAt?: number | null
}

export function etatDuBandeau(
  e: EntreeBandeau,
  maintenant: number
): EtatBandeau {
  const synchro = e.lastSyncAt ? `synchro ${heure(e.lastSyncAt)}` : undefined

  if (e.syncing && e.progress) {
    return {
      ton: "envoi",
      titre: "Envoi",
      detail: `${e.progress.sent} sur ${e.progress.total}`,
      fin: `lot ${e.progress.batch} sur ${e.progress.batchCount}`,
    }
  }
  if (!e.online) {
    return e.queue.total > 0
      ? {
          ton: "hors-ligne",
          titre: "Hors ligne",
          compte: e.queue.total,
          detail: "à envoyer",
          fin: synchro,
        }
      : {
          ton: "hors-ligne",
          titre: "Hors ligne",
          detail: "rien à envoyer",
          fin: synchro,
        }
  }
  if (!e.authenticated) {
    return e.queue.total > 0
      ? {
          ton: "session",
          titre: "Session non reconnue",
          compte: e.queue.total,
          fin: "reprise auto.",
        }
      : {
          ton: "session",
          titre: "Session non reconnue",
          detail: "rien à envoyer",
        }
  }
  if (e.queue.failed > 0) {
    const secondes = e.nextRetryAt
      ? Math.ceil((e.nextRetryAt - maintenant) / 1000)
      : undefined
    return {
      ton: "echec",
      titre: `${e.queue.failed} en échec`,
      detail: e.queue.failed > 1 ? "conservés" : "conservé",
      fin:
        secondes === undefined
          ? "nouvel essai auto."
          : secondes > 0
            ? `nouvel essai ${secondes} s`
            : "nouvel essai imminent",
    }
  }
  if (e.queue.total > 0) {
    return {
      ton: "en-ligne",
      titre: "En ligne",
      compte: e.queue.total,
      detail: "à envoyer",
      fin: synchro,
    }
  }
  return {
    ton: "en-ligne",
    titre: "En ligne",
    detail: e.lastSyncAt ? "tout est envoyé" : "rien à envoyer",
    fin: synchro,
  }
}
