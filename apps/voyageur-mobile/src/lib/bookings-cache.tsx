import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { api } from "@workspace/backend/generated"

import { useCompte } from "./compte"

export type Booking = NonNullable<FunctionReturnType<typeof api.functions.bookings.getByReference>>

type Copie = { savedAt: number; bookings: Booking[] }

const PREFIXE = "setrag:bookings:"
const INVITE = `${PREFIXE}guest`
/** Copie du dernier compte connecté : hors réseau, la session paraît absente sans l'être. */
const DERNIER_COMPTE = "setrag:compte:dernier"
const cleCompte = (userId: string) => `${PREFIXE}${userId}`

async function lire(cle: string): Promise<Copie> {
  const brut = await AsyncStorage.getItem(cle)
  return brut ? (JSON.parse(brut) as Copie) : { savedAt: 0, bookings: [] }
}

/** Fusionne deux listes de dossiers ; `prioritaires` l'emporte à référence égale. */
function fusionner(prioritaires: Booking[], autres: Booking[]) {
  const numeros = new Set(prioritaires.map((item) => item.sale.number))
  return [...prioritaires, ...autres.filter((item) => !numeros.has(item.sale.number))]
}

type Contexte = {
  bookings: Booking[]
  /** Date de la dernière copie reçue du serveur. */
  savedAt: number | null
  /** Vrai quand la liste vient du serveur, pas de la copie locale. */
  aJour: boolean
  save: (booking: Booking) => Promise<void>
  /** Efface la copie : déconnexion explicite ou suppression du compte. */
  clear: () => Promise<void>
}

const BookingsContext = createContext<Contexte | null>(null)

/**
 * Billets lisibles sans réseau. Deux règles : la copie locale ne recouvre
 * jamais une réponse du serveur, et elle n'est effacée qu'à la déconnexion
 * explicite — pas quand la session disparaît faute de réseau.
 */
export function BookingsProvider({ children }: { children: ReactNode }) {
  const { connecte, actif, profil } = useCompte()
  const userId = actif ? profil?.user._id : undefined
  const serveur = useQuery(api.functions.bookings.listMine, userId ? {} : "skip")

  // `undefined` tant que le « dernier compte » n'est pas relu.
  const [dernierCompte, setDernierCompte] = useState<string | null | undefined>(undefined)
  const [copie, setCopie] = useState<Copie & { cle: string | null }>({ cle: null, savedAt: 0, bookings: [] })
  const copieRef = useRef(copie)

  useEffect(() => {
    void AsyncStorage.getItem(DERNIER_COMPTE)
      .then((valeur) => setDernierCompte(valeur))
      .catch(() => setDernierCompte(null))
  }, [])

  // Le compte se confirme : il devient le « dernier compte », et les dossiers
  // achetés sans compte sur ce téléphone le rejoignent.
  useEffect(() => {
    if (!userId || dernierCompte === undefined || userId === dernierCompte) return
    void (async () => {
      const [invite, compte] = await Promise.all([lire(INVITE), lire(cleCompte(userId))])
      if (invite.bookings.length) {
        await AsyncStorage.setItem(cleCompte(userId), JSON.stringify({ savedAt: compte.savedAt, bookings: fusionner(compte.bookings, invite.bookings) }))
        await AsyncStorage.removeItem(INVITE)
      }
      await AsyncStorage.setItem(DERNIER_COMPTE, userId)
      setDernierCompte(userId)
    })().catch(() => undefined)
  }, [userId, dernierCompte])

  // Connecté mais pas encore identifié (profil en chargement, réseau lent) :
  // la copie du dernier compte s'affiche en attendant.
  const cle =
    dernierCompte === undefined
      ? null
      : userId && userId === dernierCompte
        ? cleCompte(userId)
        : dernierCompte
          ? cleCompte(dernierCompte)
          : connecte
            ? null
            : INVITE

  useEffect(() => {
    copieRef.current = copie
  }, [copie])

  // Lecture de la copie locale de cette clé.
  useEffect(() => {
    if (!cle) return
    let actuel = true
    lire(cle)
      .then((lue) => {
        if (!actuel) return
        // Une réponse du serveur arrivée entre-temps n'est jamais recouverte.
        if (copieRef.current.cle === cle && copieRef.current.savedAt > lue.savedAt) return
        setCopie({ cle, ...lue })
      })
      .catch(() => actuel && setCopie({ cle, savedAt: 0, bookings: [] }))
    return () => {
      actuel = false
    }
  }, [cle])

  // Réponse du serveur : elle remplace la copie, et la copie est réécrite.
  useEffect(() => {
    if (!serveur || !userId || cle !== cleCompte(userId)) return
    // Les dossiers retrouvés par référence ne figurent pas dans listMine : on les garde.
    const locaux = copieRef.current.cle === cle ? copieRef.current.bookings : []
    const suivante = { savedAt: Date.now(), bookings: fusionner(serveur, locaux) }
    const etat = { cle, ...suivante }
    copieRef.current = etat
    setCopie(etat)
    void AsyncStorage.setItem(cle, JSON.stringify(suivante))
  }, [serveur, userId, cle])

  const save = useCallback(
    async (booking: Booking) => {
      if (!cle) return
      const precedents = copieRef.current.cle === cle ? copieRef.current.bookings : []
      const suivante = { cle, savedAt: copieRef.current.cle === cle ? copieRef.current.savedAt : 0, bookings: fusionner([booking], precedents) }
      copieRef.current = suivante
      setCopie(suivante)
      await AsyncStorage.setItem(cle, JSON.stringify({ savedAt: suivante.savedAt, bookings: suivante.bookings }))
    },
    [cle],
  )

  const clear = useCallback(async () => {
    const vide = { cle: null, savedAt: 0, bookings: [] }
    copieRef.current = vide
    setCopie(vide)
    setDernierCompte(null)
    const cles = (await AsyncStorage.getAllKeys()).filter((item) => item.startsWith(PREFIXE) || item === DERNIER_COMPTE)
    await AsyncStorage.multiRemove(cles)
  }, [])

  const valeur = useMemo<Contexte>(() => {
    const active = copie.cle !== null && copie.cle === cle
    return {
      bookings: active ? copie.bookings : [],
      savedAt: active && copie.savedAt ? copie.savedAt : null,
      aJour: Boolean(serveur),
      save,
      clear,
    }
  }, [copie, cle, serveur, save, clear])

  return <BookingsContext.Provider value={valeur}>{children}</BookingsContext.Provider>
}

export function useBookings() {
  const valeur = useContext(BookingsContext)
  if (!valeur) throw new Error("BookingsProvider manquant")
  return valeur
}
