"use client"

import * as React from "react"

import { useConvex, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import {
  declarerProprietaire,
  effacerDonneesLocales,
  elaguerParcours,
  enregistrerParcours,
  lireEtat,
  listerDossiers,
  remplacerDossiers,
} from "@/lib/offline/db"
import type { Dossier } from "@/lib/offline/types"

/**
 * Nombre de parcours téléchargés d'avance.
 *
 * Le voyageur n'a besoin hors réseau que du train qu'il s'apprête à prendre.
 * Descendre la ligne entière coûterait des dizaines de requêtes à chaque
 * ouverture pour des trajets qu'il ne consultera pas ; on se limite donc aux
 * prochains départs de ses propres dossiers.
 */
const PARCOURS_ANTICIPES = 5

type DonneesLocales = {
  /** L'appareil déclare-t-il une connexion ? Voir `useOnline`. */
  enLigne: boolean
  /** Dossiers du voyageur : ceux du serveur s'ils sont là, sinon la copie. */
  dossiers: Dossier[]
  /** Vrai quand les dossiers affichés viennent de la base locale. */
  depuisLeCache: boolean
  /** Instant de la dernière réception depuis le serveur, s'il y en a eu une. */
  recuLe: number | null
  /** Ni le serveur ni la base locale n'ont encore répondu. */
  chargement: boolean
}

const Contexte = React.createContext<DonneesLocales | null>(null)

/**
 * Copie locale de l'espace voyageur.
 *
 * Ce fournisseur est monté haut, dans le shell, et non dans l'écran des
 * billets : il doit remplir la base locale même si le voyageur n'ouvre jamais
 * « Mes billets » avec du réseau. C'est le cas courant — on réserve chez soi,
 * on ouvre ses billets sur le quai.
 *
 * Il ne renvoie JAMAIS la copie locale par-dessus une réponse du serveur : la
 * copie ne sert qu'en l'absence de réponse. Un billet annulé depuis un autre
 * appareil doit disparaître dès que le réseau permet de le savoir.
 */
export function DonneesLocalesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const enLigne = useOnline()
  const { isAuthenticated, isLoading, isProfileReady, user } = useTravelerAuth()
  const convex = useConvex()

  const dossiersServeur = useQuery(
    api.functions.bookings.listMine,
    isAuthenticated && isProfileReady ? {} : "skip"
  )

  const [cache, setCache] = React.useState<Dossier[] | null>(null)
  const [recuLe, setRecuLe] = React.useState<number | null>(null)

  // Relecture de la base au démarrage : c'est elle qui alimente l'écran tant
  // que le serveur n'a pas répondu — donc, hors réseau, indéfiniment.
  React.useEffect(() => {
    let vivant = true
    void (async () => {
      try {
        const [enregistres, etat] = await Promise.all([
          listerDossiers(),
          lireEtat(),
        ])
        if (!vivant) return
        setCache(enregistres.map((item) => item.dossier))
        setRecuLe(etat.billetsRecusLe)
      } catch {
        // Navigation privée, quota refusé : l'application reste utilisable en
        // ligne, elle perd seulement sa mémoire.
        if (vivant) setCache([])
      }
    })()
    return () => {
      vivant = false
    }
  }, [])

  /**
   * Filet de sécurité : une session absente alors que le réseau répond.
   *
   * L'effacement normal a lieu à la déconnexion explicite (`seDeconnecter`).
   * Celui-ci rattrape les sessions expirées ou révoquées à distance — mais
   * SEULEMENT en ligne. Hors réseau, la session ne peut pas être revalidée et
   * le voyageur paraît déconnecté : effacer là reviendrait à détruire ses
   * billets à l'instant précis où ils sont sa seule ressource.
   */
  React.useEffect(() => {
    if (isLoading || isAuthenticated) return
    void (async () => {
      // L'état du réseau est relu ICI, et non pris au rendu : le premier rendu
      // se fait toujours sous l'hypothèse « en ligne » — le serveur, lui, l'est
      // par construction — et l'effet part avant que `useOnline` n'ait publié
      // la valeur réelle. Effacer sur cette hypothèse détruirait les billets
      // d'un voyageur qui ouvre l'application justement parce qu'il n'a plus
      // de réseau.
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      // L'effacement est inconditionnel plutôt que subordonné à la présence
      // d'un propriétaire déclaré : une base dont l'état a été perdu — mise à
      // jour interrompue, écriture partielle — garderait sinon des billets que
      // plus personne ne réclamerait jamais.
      await effacerDonneesLocales().catch(() => {})
      setCache((actuel) => (actuel !== null && actuel.length === 0 ? actuel : []))
      setRecuLe((actuel) => (actuel === null ? actuel : null))
    })()
  }, [enLigne, isAuthenticated, isLoading])

  // Enregistrement des dossiers reçus du serveur.
  React.useEffect(() => {
    if (!dossiersServeur || !user) return
    const instant = Date.now()
    void (async () => {
      try {
        // Le propriétaire est déclaré AVANT l'écriture : si le téléphone
        // change de main, les dossiers du précédent sont effacés d'abord.
        await declarerProprietaire(user.id)
        await remplacerDossiers(dossiersServeur, instant)
        setCache(dossiersServeur)
        setRecuLe(instant)
      } catch {
        // Une base indisponible ne doit pas empêcher la consultation en ligne.
      }
    })()
  }, [dossiersServeur, user])

  // Téléchargement des parcours des prochains trajets, tant qu'il y a du
  // réseau. Sans cela, le suivi n'aurait rien à montrer une fois à bord.
  React.useEffect(() => {
    if (!dossiersServeur) return
    const maintenant = Date.now()
    const tripIds = [
      ...new Set(
        dossiersServeur
          .filter((dossier) => dossier.trip !== null)
          .sort(
            (a, b) => (a.trip?.departureAt ?? 0) - (b.trip?.departureAt ?? 0)
          )
          .map((dossier) => dossier.trip!._id)
      ),
    ]
    // Les trajets déjà partis restent utiles tant que leur dossier existe —
    // un voyageur consulte son parcours pendant le trajet, pas seulement
    // avant — mais on ne télécharge d'avance que ceux à venir.
    const aTelecharger = tripIds
      .filter((tripId) =>
        dossiersServeur.some(
          (dossier) =>
            dossier.trip?._id === tripId &&
            (dossier.trip?.arrivalAt ?? 0) >= maintenant
        )
      )
      .slice(0, PARCOURS_ANTICIPES)

    let vivant = true
    void (async () => {
      for (const tripId of aTelecharger) {
        if (!vivant) return
        try {
          const detail = await convex.query(api.functions.trips.get, {
            tripId: tripId as never,
          })
          if (!vivant || !detail) return
          await enregistrerParcours(detail, Date.now())
        } catch {
          // Hors réseau ou trajet refusé : on garde ce qui est déjà en base.
          return
        }
      }
      // L'élagage vient après, et sur la liste complète : un parcours dont le
      // dossier a disparu n'a plus de raison d'occuper la place.
      if (vivant) await elaguerParcours(tripIds).catch(() => {})
    })()
    return () => {
      vivant = false
    }
  }, [convex, dossiersServeur])

  const valeur = React.useMemo<DonneesLocales>(() => {
    const aDuCache = (cache?.length ?? 0) > 0
    // Le serveur va répondre : on ne conclura donc pas à l'absence de billets
    // avant qu'il l'ait fait, sauf à faire clignoter « aucune réservation »
    // sur l'écran d'un voyageur qui en a.
    const attenteServeur =
      isAuthenticated && isProfileReady && dossiersServeur === undefined
    return {
      enLigne,
      dossiers: dossiersServeur ?? cache ?? [],
      depuisLeCache: dossiersServeur === undefined && aDuCache,
      recuLe,
      chargement: (cache === null || attenteServeur) && !aDuCache,
    }
  }, [
    cache,
    dossiersServeur,
    enLigne,
    isAuthenticated,
    isProfileReady,
    recuLe,
  ])

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

/**
 * Copie locale de l'espace voyageur.
 *
 * Utilisable hors du fournisseur : les écrans montés dans les tests unitaires
 * ne l'ont pas toujours au-dessus d'eux, et l'absence de copie locale n'est
 * pas une erreur — c'est simplement un appareil qui n'a rien enregistré.
 */
export function useDonneesLocales(): DonneesLocales {
  return (
    React.useContext(Contexte) ?? {
      enLigne: true,
      dossiers: [],
      depuisLeCache: false,
      recuLe: null,
      chargement: false,
    }
  )
}
