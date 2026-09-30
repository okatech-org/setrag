"use client"

import type { FunctionReturnType } from "convex/server"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useAction, useConvex, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { messageServeur } from "@/fonctionnalites/tunnel/outils"
import { memoriserContact } from "@/lib/acces-reservation"

import { cleInvite } from "./cle-invite"
import { useGares } from "../reference/use-reference"
import { decrirePage } from "./contexte-page"
import { recordOf, texteDe, type Approbation, type Entree } from "./types"

export type IdConversation = FunctionReturnType<typeof api.ai.conversations.create>["conversationId"]

/** Au-delà, les plus anciennes entrées quittent la mémoire de l'onglet. */
const ENTREES_MAX = 80
const CLE_SESSION = "setrag:ruban"

interface Memoire {
  conversationId: IdConversation | null
  entrees: Entree[]
}

const REPONSE_INTERROMPUE = "Réponse interrompue par le rechargement de la page. Relancez la question."

function lireMemoire(): Memoire {
  try {
    const brut = window.sessionStorage.getItem(CLE_SESSION)
    if (!brut) return { conversationId: null, entrees: [] }
    const valeur = JSON.parse(brut) as Memoire
    // Une réponse qui s'écrivait au moment du rechargement ne se suit plus :
    // elle se relance, et le serveur ressert le tour s'il l'a terminé.
    return {
      conversationId: valeur.conversationId,
      entrees: valeur.entrees.map((e) =>
        e.role === "ruban" ? { ...e, direct: false, ...(e.etat === "en-cours" ? { etat: "erreur" as const, erreur: REPONSE_INTERROMPUE } : {}) } : e
      ),
    }
  } catch {
    return { conversationId: null, entrees: [] }
  }
}

/** La réponse de Ruban à la question `idEntree`, vide, prête à s'écrire. */
function reponseEnCours(idEntree: string): Entree {
  return { id: `ruban-${idEntree}`, role: "ruban", texte: "", cartes: [], approbations: [], etat: "en-cours", question: idEntree, direct: true }
}

function messageErreur(erreur: unknown): string {
  // Convex enveloppe les erreurs serveur d'un contexte technique, et masque
  // leur détail en production (« [Request ID: …] Server Error ») : ce texte-là
  // ne s'affiche pas, on dit ce qu'on sait.
  return messageServeur(erreur) ?? "Ruban n'a pas pu répondre. Réessayez dans un instant."
}

export interface EtatRuban {
  /** La fenêtre (bureau) ou la feuille (mobile) est ouverte. */
  ouvert: boolean
  ouvrir: () => void
  fermer: () => void
  /** Première ouverture de la session : le signe se trace une fois. */
  premiereOuverture: boolean
  conversationId: IdConversation | null
  entrees: Entree[]
  /** Une réponse est attendue. */
  reflechit: boolean
  /** Ruban est configuré côté serveur (fournisseur et clé présents). */
  disponible: boolean | undefined
  enLigne: boolean
  envoyer: (texte: string, options?: { vocal?: boolean }) => Promise<void>
  renvoyer: (idEntree: string) => Promise<void>
  confirmer: (callId: string) => Promise<void>
  refuser: (callId: string) => Promise<void>
  nouvelleConversation: () => void
  /** Garantit l'existence d'une conversation (la voix en a besoin). */
  assurerConversation: () => Promise<IdConversation>
  /** Ajoute au fil ce qui s'est dit à voix haute. */
  ajouterEntree: (entree: Entree) => void
  /** Reprend une conversation passée du compte (page /assistant). */
  reprendre: (conversationId: IdConversation) => Promise<void>
  guestKey: string
}

const Contexte = createContext<EtatRuban | null>(null)

/**
 * L'état de Ruban, commun à la fenêtre flottante, à la feuille mobile et à la
 * page /assistant : on commence une conversation dans la fenêtre, on la
 * poursuit en grand, sans rien perdre. Monté dans la coquille, il survit aux
 * changements de page.
 */
export function RubanProvider({ children }: { children: ReactNode }) {
  const enLigne = useOnline()
  const { isAuthenticated, isProfileReady } = useTravelerAuth()
  const { parCode } = useGares()

  const creer = useMutation(api.ai.conversations.create)
  const rattacher = useMutation(api.ai.conversations.claim)
  const envoyerMessage = useAction(api.ai.chat.sendMessage)
  const approuver = useAction(api.ai.chat.approveToolCall)
  const rejeter = useAction(api.ai.chat.rejectToolCall)
  const configuration = useQuery(api.ai.conversations.getConfiguration, {})
  const convex = useConvex()

  const [ouvert, setOuvert] = useState(false)
  const [premiereOuverture, setPremiereOuverture] = useState(false)
  const [memoire, setMemoire] = useState<Memoire>({ conversationId: null, entrees: [] })
  const [reflechit, setReflechit] = useState(false)
  // La question dont la réponse s'écrit : le fil s'abonne à son message, et
  // le texte affiché est celui que le serveur a réellement reçu.
  const [enCours, setEnCours] = useState<{ idEntree: string; conversationId: IdConversation } | null>(null)
  const flux = useQuery(
    api.ai.conversations.getReply,
    enCours ? { conversationId: enCours.conversationId, guestKey: cleInvite(), requestId: enCours.idEntree } : "skip"
  )
  const dernierFlux = useRef<typeof flux>(undefined)
  // Le serveur a rouvert la réponse pendant cet essai : son état fait foi.
  const vuEnCours = useRef(false)
  useEffect(() => {
    if (!flux) return
    dernierFlux.current = flux
    if (flux.status === "en_cours") vuEnCours.current = true
  }, [flux])
  const [guestKey, setGuestKey] = useState("")
  // L'onglet n'est relu qu'après l'hydratation ; jusque-là, la mémoire vide du
  // premier rendu ne doit pas l'écraser. Sans ce verrou, le double montage du
  // mode strict relisait un onglet déjà vidé et perdait la conversation.
  const [memoireLue, setMemoireLue] = useState(false)
  const creation = useRef<Promise<IdConversation> | null>(null)
  const rattachee = useRef<string | null>(null)

  useEffect(() => {
    setGuestKey(cleInvite())
    setMemoire(lireMemoire())
    setMemoireLue(true)
  }, [])

  useEffect(() => {
    if (!memoireLue) return
    try {
      window.sessionStorage.setItem(CLE_SESSION, JSON.stringify({ ...memoire, entrees: memoire.entrees.slice(-ENTREES_MAX) }))
    } catch {
      // Stockage plein ou refusé : la conversation vit le temps de la page.
    }
  }, [memoire, memoireLue])

  const modifier = useCallback((maj: (entrees: Entree[]) => Entree[]) => {
    setMemoire((m) => ({ ...m, entrees: maj(m.entrees) }))
  }, [])

  const assurerConversation = useCallback(async (): Promise<IdConversation> => {
    if (memoire.conversationId) return memoire.conversationId
    creation.current ??= creer({ guestKey: cleInvite(), assistantId: "concierge" }).then((r) => {
      setMemoire((m) => ({ ...m, conversationId: r.conversationId }))
      // Le serveur dit si la conversation appartient déjà au compte. Une
      // session ouverte avant son profil (inscription en cours) crée une
      // conversation invitée : elle reste à rattacher, sans quoi Ruban ne
      // connaîtrait ni le profil ni les voyageurs du compte.
      rattachee.current = r.attachedToAccount ? r.conversationId : null
      return r.conversationId
    })
    try {
      return await creation.current
    } finally {
      creation.current = null
    }
  }, [creer, memoire.conversationId])

  const nouvelleConversation = useCallback(() => {
    rattachee.current = null
    setEnCours(null)
    setMemoire({ conversationId: null, entrees: [] })
  }, [])

  // Connexion en cours de conversation : elle est rattachée au compte, avec
  // son historique, et les tours suivants voient les billets du voyageur.
  useEffect(() => {
    const id = memoire.conversationId
    if (!id || !isAuthenticated || !isProfileReady || rattachee.current === id) return
    rattachee.current = id
    void rattacher({ conversationId: id, guestKey: cleInvite() }).catch((erreur: unknown) => {
      const texte = erreur instanceof Error ? erreur.message : ""
      // Conversation d'un autre compte (appareil partagé), close ou inconnue :
      // on repart de zéro. Une coupure réseau, elle, se retente plus tard.
      if (/autre compte|inaccessible|introuvable|termin|close/i.test(texte)) nouvelleConversation()
      else rattachee.current = null
    })
  }, [isAuthenticated, isProfileReady, memoire.conversationId, nouvelleConversation, rattacher])

  // Déconnexion : la conversation appartient au compte, l'onglet la quitte.
  const etaitConnecte = useRef(isAuthenticated)
  useEffect(() => {
    if (etaitConnecte.current && !isAuthenticated) nouvelleConversation()
    etaitConnecte.current = isAuthenticated
  }, [isAuthenticated, nouvelleConversation])

  /**
   * Un tour : la réponse `ruban-<id>` existe déjà dans le fil (vide, en
   * cours) ; elle se remplit au fil du flux puis devient la réponse finale,
   * sans changer d'entrée — le fil ne démonte ni ne remonte rien.
   */
  const traiter = useCallback(
    async (idEntree: string, texte: string) => {
      setReflechit(true)
      dernierFlux.current = undefined
      vuEnCours.current = false
      const idReponse = `ruban-${idEntree}`
      let conversationId: IdConversation | null = null
      try {
        conversationId = await assurerConversation()
        setEnCours({ idEntree, conversationId })
        const resultat = await envoyerMessage({
          conversationId,
          guestKey: cleInvite(),
          requestId: idEntree,
          content: texte,
          pageContext: decrirePage(window.location.pathname, new URLSearchParams(window.location.search), parCode),
        })
        modifier((entrees) =>
          entrees.map((e): Entree => {
            if (e.id === idEntree && e.role === "moi") return { ...e, envoi: "ok" }
            if (e.id !== idReponse || e.role !== "ruban") return e
            return {
              ...e,
              texte: resultat.message,
              cartes: resultat.clientActions,
              approbations: resultat.pendingApprovals.map((a) => ({
                callId: a.callId,
                toolName: a.toolName,
                label: a.label,
                input: a.input,
                etat: "ouverte" as const,
              })),
              etat: undefined,
              erreur: undefined,
            }
          })
        )
      } catch (erreur) {
        // Le serveur a gardé le texte déjà écrit et un libellé clair : on les
        // relit tels qu'enregistrés, faute de mieux ce que le flux a montré.
        let recu: FunctionReturnType<typeof api.ai.conversations.getReply> = (dernierFlux.current as typeof flux) ?? null
        if (conversationId) {
          try {
            recu = (await convex.query(api.ai.conversations.getReply, { conversationId, guestKey: cleInvite(), requestId: idEntree })) ?? recu
          } catch {
            // Hors réseau : on garde ce que le flux a montré.
          }
        }
        // Une relance refusée avant de répondre (trop de messages, tour déjà
        // en cours) retrouve l'erreur de l'essai précédent : elle ne compte
        // que si le serveur a rouvert la réponse pendant cet essai.
        const fiable = recu && (recu.status !== "erreur" || vuEnCours.current) ? recu : null
        modifier((entrees) =>
          entrees.map((e): Entree => {
            if (e.id === idEntree && e.role === "moi") return { ...e, envoi: "ok" }
            if (e.id !== idReponse || e.role !== "ruban") return e
            return { ...e, texte: fiable?.content ?? "", etat: "erreur", erreur: fiable?.error ?? messageErreur(erreur) }
          })
        )
      } finally {
        setEnCours(null)
        setReflechit(false)
      }
    },
    [assurerConversation, convex, envoyerMessage, modifier, parCode]
  )

  const envoyer = useCallback(
    async (texte: string, options?: { vocal?: boolean }) => {
      const propre = texte.trim()
      if (!propre || reflechit) return
      // L'identifiant de l'entrée sert de clé d'idempotence : un renvoi après
      // coupure ne crée pas un second tour.
      const id = crypto.randomUUID()
      modifier((entrees) => [...entrees, { id, role: "moi", texte: propre, vocal: options?.vocal, envoi: "en-cours" }, reponseEnCours(id)])
      await traiter(id, propre)
    },
    [modifier, reflechit, traiter]
  )

  const renvoyer = useCallback(
    async (idEntree: string) => {
      const entree = memoire.entrees.find((e) => e.id === idEntree)
      if (!entree || entree.role !== "moi" || reflechit) return
      modifier((entrees) => {
        // Anciennes entrées d'erreur (avant le flux) : elles cèdent la place.
        const restantes = entrees.filter((e) => !e.id.startsWith(`erreur-${idEntree}`))
        const idReponse = `ruban-${idEntree}`
        const suite = restantes.map((e) => (e.id === idEntree && e.role === "moi" ? { ...e, envoi: "en-cours" as const } : e))
        // La même réponse repart de zéro, à la même place : même entrée.
        if (suite.some((e) => e.id === idReponse)) return suite.map((e) => (e.id === idReponse ? reponseEnCours(idEntree) : e))
        const index = suite.findIndex((e) => e.id === idEntree)
        return [...suite.slice(0, index + 1), reponseEnCours(idEntree), ...suite.slice(index + 1)]
      })
      await traiter(idEntree, entree.texte)
    },
    [memoire.entrees, modifier, reflechit, traiter]
  )

  const majApprobation = useCallback(
    (callId: string, maj: Partial<Approbation>) => {
      modifier((entrees) =>
        entrees.map((e) =>
          e.role === "ruban" && e.approbations.some((a) => a.callId === callId)
            ? { ...e, approbations: e.approbations.map((a) => (a.callId === callId ? { ...a, ...maj } : a)) }
            : e
        )
      )
    },
    [modifier]
  )

  const approbation = useCallback(
    (callId: string) => memoire.entrees.flatMap((e) => (e.role === "ruban" ? e.approbations : [])).find((a) => a.callId === callId),
    [memoire.entrees]
  )

  const confirmer = useCallback(
    async (callId: string) => {
      const cible = approbation(callId)
      const conversationId = memoire.conversationId
      if (!cible || !conversationId || cible.etat === "en-cours") return
      majApprobation(callId, { etat: "en-cours", erreur: undefined })
      try {
        const resultat = await approuver({ conversationId, guestKey: cleInvite(), callId })
        if (resultat.status === "ok") {
          // Un invité relit sa réservation avec le téléphone de contact.
          const reference = texteDe(recordOf(resultat.output).reference)
          const telephone = texteDe(recordOf(cible.input).contactPhone)
          if (reference && telephone) memoriserContact(reference, telephone)
          majApprobation(callId, { etat: "confirmee", resultat: resultat.output })
        } else {
          majApprobation(callId, { etat: "echec", erreur: resultat.status === "error" ? resultat.message : "Cette action attend encore une confirmation." })
        }
      } catch (erreur) {
        majApprobation(callId, { etat: "echec", erreur: messageErreur(erreur) })
      }
    },
    [approbation, approuver, majApprobation, memoire.conversationId]
  )

  const refuser = useCallback(
    async (callId: string) => {
      const conversationId = memoire.conversationId
      if (!conversationId) return
      majApprobation(callId, { etat: "en-cours" })
      try {
        await rejeter({ conversationId, guestKey: cleInvite(), callId })
        majApprobation(callId, { etat: "refusee" })
      } catch (erreur) {
        majApprobation(callId, { etat: "echec", erreur: messageErreur(erreur) })
      }
    },
    [majApprobation, memoire.conversationId, rejeter]
  )

  const ouvrir = useCallback(() => {
    setOuvert(true)
    try {
      if (!window.sessionStorage.getItem("setrag:ruban-trace")) {
        window.sessionStorage.setItem("setrag:ruban-trace", "1")
        setPremiereOuverture(true)
      } else setPremiereOuverture(false)
    } catch {
      setPremiereOuverture(false)
    }
  }, [])

  const reprendre = useCallback(
    async (conversationId: IdConversation) => {
      const [messages, tours] = await Promise.all([
        convex.query(api.ai.conversations.listMessages, { conversationId, guestKey: cleInvite(), limit: 100 }),
        convex.query(api.ai.conversations.listTurns, { conversationId, guestKey: cleInvite(), limit: 100 }),
      ])
      // Les cartes et confirmations d'un tour se rattachent à la réponse du
      // même tour : l'identifiant de requête les relie.
      const parRequete = new Map(tours.map((tour) => [tour.requestId, tour]))
      const ETATS = { approval_required: "ouverte", running: "en-cours", succeeded: "confirmee", rejected: "refusee", failed: "echec" } as const
      rattachee.current = conversationId
      // Les entrées portent l'identifiant de la question (clé d'idempotence) :
      // une réponse interrompue se relance sur le même tour.
      const pris = new Set<string>()
      const idLibre = (voulu: string | undefined, secours: string) => {
        const id = voulu && !pris.has(voulu) ? voulu : secours
        pris.add(id)
        return id
      }
      setMemoire({
        conversationId,
        entrees: messages.flatMap((m): Entree[] => {
          if (m.role === "user") return [{ id: idLibre(m.requestId, m._id), role: "moi", texte: m.content, envoi: "ok" }]
          if (m.role !== "assistant") return []
          const tour = m.requestId ? parRequete.get(m.requestId) : undefined
          // Une réponse qui s'écrit ailleurs (autre onglet) ou interrompue se
          // montre telle quelle, avec de quoi la relancer.
          const interrompue = m.status === "en_cours" || m.status === "erreur"
          return [
            {
              id: idLibre(m.requestId ? `ruban-${m.requestId}` : undefined, m._id),
              role: "ruban",
              texte: m.content,
              cartes: tour?.clientActions ?? [],
              approbations:
                tour?.pendingApprovals.map((a) => ({
                  callId: a.callId,
                  toolName: a.toolName,
                  label: a.label,
                  input: a.input,
                  etat: ETATS[a.status],
                })) ?? [],
              ...(interrompue
                ? { etat: "erreur" as const, erreur: m.error ?? "Cette réponse n'a pas abouti. Relancez la question.", question: m.requestId }
                : {}),
            },
          ]
        }),
      })
    },
    [convex]
  )

  // La réponse en cours prend le texte que le serveur a reçu jusqu'ici. Lors
  // d'une relance, l'état « erreur » de l'essai précédent peut arriver avant
  // que le serveur ne rouvre le message : il ne s'affiche pas.
  const entrees = useMemo(() => {
    if (!enCours || !flux || flux.status === "erreur") return memoire.entrees
    const idReponse = `ruban-${enCours.idEntree}`
    return memoire.entrees.map((e) => (e.id === idReponse && e.role === "ruban" && e.etat === "en-cours" ? { ...e, texte: flux.content } : e))
  }, [enCours, flux, memoire.entrees])

  const disponible = configuration?.assistants.find((a) => a.id === "concierge")?.configured

  const valeur = useMemo<EtatRuban>(
    () => ({
      ouvert,
      ouvrir,
      fermer: () => setOuvert(false),
      premiereOuverture,
      conversationId: memoire.conversationId,
      entrees,
      reflechit,
      disponible,
      enLigne,
      envoyer,
      renvoyer,
      confirmer,
      refuser,
      nouvelleConversation,
      assurerConversation,
      ajouterEntree: (entree) => modifier((entrees) => [...entrees, entree]),
      reprendre,
      guestKey,
    }),
    [assurerConversation, confirmer, disponible, enLigne, entrees, envoyer, guestKey, memoire.conversationId, modifier, nouvelleConversation, ouvert, ouvrir, premiereOuverture, reflechit, refuser, renvoyer, reprendre]
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useRuban(): EtatRuban {
  const valeur = useContext(Contexte)
  if (!valeur) throw new Error("useRuban() doit être utilisé sous <RubanProvider>.")
  return valeur
}
