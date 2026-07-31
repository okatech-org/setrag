/**
 * Base locale du voyageur, sur IndexedDB.
 *
 * Elle ne sert qu'à RELIRE : contrairement au terminal de contrôle, rien ne
 * s'écrit ici en attente d'envoi. Un voyageur hors réseau ne réserve pas, ne
 * paie pas, n'annule pas — il consulte le billet qu'il possède déjà et le
 * parcours du train qu'il attend. Il n'y a donc ni file d'envoi ni conflit à
 * arbitrer : le serveur reste seul maître des données, la base locale en garde
 * une copie datée.
 *
 * Deux précautions, en revanche, sont tenues fermement :
 *
 *  — les données sont NOMINATIVES (nom du voyageur, trajet, code du billet).
 *    Un téléphone change de main : la base porte l'identifiant de son
 *    propriétaire et s'efface dès qu'un autre voyageur s'y connecte, comme à
 *    la déconnexion ;
 *
 *  — chaque enregistrement porte sa date. L'application affiche l'âge de ce
 *    qu'elle montre hors réseau, plutôt que de laisser croire à un horaire
 *    tenu à jour.
 */

import type {
  DetailTrajet,
  Dossier,
  DossierHorsLigne,
  EtatLocal,
  ParcoursHorsLigne,
} from "./types"

export const DB_NAME = "setrag-voyageur"
export const DB_VERSION = 1

export const STORES = {
  dossiers: "dossiers",
  parcours: "parcours",
  etat: "etat",
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

/** Clé unique de l'enregistrement d'état — la base n'en compte qu'un. */
const CLE_ETAT = "etat"

let handle: Promise<IDBDatabase> | null = null

/** Ouvre — et crée au besoin — la base locale. */
export function openDb(): Promise<IDBDatabase> {
  if (handle) return handle
  handle = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible sur cet appareil"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.dossiers)) {
        const store = db.createObjectStore(STORES.dossiers, {
          keyPath: "reference",
        })
        // Le tri par départ est le seul dont l'écran des billets a besoin :
        // « à venir » d'abord, le reste ensuite.
        store.createIndex("by_depart", "departAt")
      }
      if (!db.objectStoreNames.contains(STORES.parcours)) {
        const store = db.createObjectStore(STORES.parcours, {
          keyPath: "tripId",
        })
        // Le suivi se cherche par numéro de train et date de circulation :
        // c'est ce que le voyageur saisit, et jamais l'identifiant du trajet.
        store.createIndex("by_train", ["trainNumber", "serviceDate"])
      }
      if (!db.objectStoreNames.contains(STORES.etat)) {
        db.createObjectStore(STORES.etat, { keyPath: "cle" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return handle
}

/**
 * Ferme la connexion et oublie le cache d'ouverture.
 *
 * La fermeture n'est pas décorative : tant qu'une connexion reste ouverte,
 * `deleteDatabase` et les montées de version restent bloqués indéfiniment.
 */
export async function closeDb(): Promise<void> {
  const current = handle
  handle = null
  if (!current) return
  try {
    ;(await current).close()
  } catch {
    // Une base déjà fermée ou jamais ouverte n'a rien à libérer.
  }
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Attend la fin d'une transaction, pas seulement celle de ses requêtes. */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("Transaction interrompue"))
  })
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(store, mode)
  const result = await run(tx.objectStore(store))
  await done(tx)
  return result
}

/* ─────────────────────────────── Dossiers ───────────────────────────────── */

/**
 * Remplace la copie locale des dossiers du voyageur.
 *
 * Le remplacement est INTÉGRAL et tenu dans une seule transaction, avec la
 * date de réception : un dossier annulé côté serveur doit disparaître du
 * téléphone, et une fusion enregistrement par enregistrement le laisserait en
 * place indéfiniment. La liste reçue fait foi.
 */
export async function remplacerDossiers(
  dossiers: Dossier[],
  recuLe: number
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORES.dossiers, STORES.etat], "readwrite")
  const store = tx.objectStore(STORES.dossiers)
  store.clear()
  for (const dossier of dossiers) {
    const enregistrement: DossierHorsLigne = {
      reference: dossier.sale.number,
      dossier,
      departAt: dossier.trip?.departureAt ?? 0,
      enregistreLe: recuLe,
    }
    store.put(enregistrement)
  }
  const etat = await wrap<StoredEtat | undefined>(
    tx.objectStore(STORES.etat).get(CLE_ETAT)
  )
  tx.objectStore(STORES.etat).put({
    cle: CLE_ETAT,
    utilisateur: etat?.utilisateur ?? null,
    billetsRecusLe: recuLe,
  } satisfies StoredEtat)
  await done(tx)
}

export async function listerDossiers(): Promise<DossierHorsLigne[]> {
  const enregistrements = await withStore(STORES.dossiers, "readonly", (s) =>
    wrap<DossierHorsLigne[]>(s.getAll())
  )
  return enregistrements.sort((a, b) => a.departAt - b.departAt)
}

export async function lireDossier(
  reference: string
): Promise<DossierHorsLigne | undefined> {
  return await withStore(STORES.dossiers, "readonly", (s) =>
    wrap<DossierHorsLigne | undefined>(s.get(reference))
  )
}

/* ─────────────────────────────── Parcours ───────────────────────────────── */

/**
 * Enregistre le parcours d'un trajet : arrêts, heures, retard au relevé.
 *
 * Le numéro de train et la date sont extraits ici plutôt que passés par
 * l'appelant : ils viennent du même objet que le reste, et un décalage entre
 * la clé de recherche et le contenu rendrait le parcours introuvable.
 */
export async function enregistrerParcours(
  detail: DetailTrajet,
  recuLe: number
): Promise<void> {
  const enregistrement: ParcoursHorsLigne = {
    tripId: detail.trip._id,
    trainNumber: detail.trip.trainNumber,
    serviceDate: detail.trip.serviceDate,
    detail,
    enregistreLe: recuLe,
  }
  await withStore(STORES.parcours, "readwrite", (s) =>
    wrap(s.put(enregistrement))
  )
}

export async function lireParcours(
  tripId: string
): Promise<ParcoursHorsLigne | undefined> {
  return await withStore(STORES.parcours, "readonly", (s) =>
    wrap<ParcoursHorsLigne | undefined>(s.get(tripId))
  )
}

/** Retrouve un parcours à partir de ce que le voyageur saisit dans le suivi. */
export async function chercherParcours(
  trainNumber: string,
  serviceDate: string
): Promise<ParcoursHorsLigne | undefined> {
  return await withStore(STORES.parcours, "readonly", (s) =>
    wrap<ParcoursHorsLigne | undefined>(
      s.index("by_train").get([trainNumber, serviceDate])
    )
  )
}

export async function listerParcours(): Promise<ParcoursHorsLigne[]> {
  return await withStore(STORES.parcours, "readonly", (s) =>
    wrap<ParcoursHorsLigne[]>(s.getAll())
  )
}

/* ───────────────────────────────── État ─────────────────────────────────── */

type StoredEtat = EtatLocal & { cle: typeof CLE_ETAT }

export async function lireEtat(): Promise<EtatLocal> {
  const stored = await withStore(STORES.etat, "readonly", (s) =>
    wrap<StoredEtat | undefined>(s.get(CLE_ETAT))
  )
  return {
    utilisateur: stored?.utilisateur ?? null,
    billetsRecusLe: stored?.billetsRecusLe ?? null,
  }
}

/**
 * Déclare à qui appartiennent les données locales.
 *
 * Si le propriétaire change, tout est effacé AVANT que le nouveau titulaire
 * n'écrive quoi que ce soit : sur un téléphone prêté, le second voyageur ne
 * doit à aucun moment voir les billets du premier. La comparaison porte sur
 * l'identifiant de compte, pas sur le numéro de téléphone, qui peut être
 * réattribué.
 *
 * Retourne `true` si la base a été effacée à cette occasion.
 */
export async function declarerProprietaire(
  utilisateur: string
): Promise<boolean> {
  const etat = await lireEtat()
  if (etat.utilisateur === utilisateur) return false
  if (etat.utilisateur !== null) await effacerDonneesLocales()
  const db = await openDb()
  const tx = db.transaction(STORES.etat, "readwrite")
  tx.objectStore(STORES.etat).put({
    cle: CLE_ETAT,
    utilisateur,
    // La date de réception appartient au propriétaire précédent : la conserver
    // ferait dater les billets du nouveau venu d'avant sa première connexion.
    billetsRecusLe: etat.utilisateur === null ? etat.billetsRecusLe : null,
  } satisfies StoredEtat)
  await done(tx)
  return etat.utilisateur !== null
}

/**
 * Efface billets, parcours et propriétaire.
 *
 * Appelée à la déconnexion : un billet nominatif ne doit pas survivre à la
 * session qui l'a téléchargé.
 */
export async function effacerDonneesLocales(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(
    [STORES.dossiers, STORES.parcours, STORES.etat],
    "readwrite"
  )
  tx.objectStore(STORES.dossiers).clear()
  tx.objectStore(STORES.parcours).clear()
  tx.objectStore(STORES.etat).clear()
  await done(tx)
}

/**
 * Retire les parcours dont plus aucun dossier ne dépend.
 *
 * Sans cet élagage, la base garderait un parcours par train jamais repris,
 * indéfiniment. Les trajets encore référencés par un dossier sont conservés,
 * même passés : un billet de la veille reste consultable.
 */
export async function elaguerParcours(
  tripIdsUtiles: readonly string[]
): Promise<number> {
  const utiles = new Set(tripIdsUtiles)
  const db = await openDb()
  const tx = db.transaction(STORES.parcours, "readwrite")
  const store = tx.objectStore(STORES.parcours)
  const tous = await wrap<ParcoursHorsLigne[]>(store.getAll())
  let retires = 0
  for (const parcours of tous) {
    if (utiles.has(parcours.tripId)) continue
    store.delete(parcours.tripId)
    retires += 1
  }
  await done(tx)
  return retires
}
