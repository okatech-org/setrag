"use client"

import { LockIcon } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { sha256 } from "@noble/hashes/sha256"

import { Button } from "@workspace/ui/components/button"
import { CodeOtp } from "@workspace/ui/components/code-otp"

import { TERRAIN } from "@/composants/boutons"
import { BandeauService } from "@/coquille/bandeau-service"
import { useTerminal } from "@/fonctionnalites/terminal/contexte-terminal"

/**
 * Verrouillage du terminal après inactivité.
 *
 * Un terminal contrôleur porte le manifeste d'une desserte entière — noms,
 * places, trajets. Posé cinq minutes sur une tablette de voiture, il doit se
 * refermer. Mais le déverrouillage ne peut pas exiger le réseau : il se fait
 * donc par un code court vérifié LOCALEMENT, la session Better Auth restant
 * ouverte derrière. Redemander le second facteur ici condamnerait l'agent à
 * attendre la prochaine gare pour reprendre son contrôle.
 *
 * Le code n'est jamais stocké : seule son empreinte l'est.
 */

const INACTIVITE_MS = 5 * 60 * 1000
const SEL = "setrag-controle-v1"
const LONGUEUR = 4

function empreinte(code: string): string {
  const octets = sha256(new TextEncoder().encode(`${SEL}:${code}`))
  return [...octets].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const Contexte = createContext<{
  verrouiller: () => void
  possible: boolean
} | null>(null)

/** Verrouiller le terminal d'un geste (bouton cadenas de la tournée). */
export function useVerrouillage() {
  return useContext(Contexte) ?? { verrouiller: () => {}, possible: false }
}

export function Verrouillage({ children }: { children: ReactNode }) {
  const { settings, updateSettings, queue, ready } = useTerminal()
  // Pourquoi le terminal s'est refermé : l'écran le dit tel quel.
  const [verrouille, setVerrouille] = useState<false | "inactivite" | "manuel">(
    false
  )
  const [saisie, setSaisie] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const minuteur = useRef<number | null>(null)

  const aUnCode = Boolean(settings.lockHash)

  const armer = useCallback(() => {
    if (minuteur.current) window.clearTimeout(minuteur.current)
    // Sans code défini, verrouiller enfermerait l'agent dehors.
    if (!aUnCode) return
    minuteur.current = window.setTimeout(
      () => setVerrouille("inactivite"),
      INACTIVITE_MS
    )
  }, [aUnCode])

  useEffect(() => {
    if (!ready) return
    armer()
    const evenements = ["pointerdown", "keydown", "visibilitychange"] as const
    const activite = () => {
      if (document.visibilityState === "hidden") return
      armer()
    }
    for (const evenement of evenements) {
      window.addEventListener(evenement, activite, { passive: true })
    }
    return () => {
      for (const evenement of evenements)
        window.removeEventListener(evenement, activite)
      if (minuteur.current) window.clearTimeout(minuteur.current)
    }
  }, [armer, ready])

  const valider = useCallback(
    async (code: string) => {
      if (code.length < LONGUEUR) {
        setErreur("Le code compte quatre chiffres.")
        return
      }
      if (!aUnCode) {
        await updateSettings({ lockHash: empreinte(code) })
        setSaisie("")
        setErreur(null)
        return
      }
      if (empreinte(code) !== settings.lockHash) {
        setErreur("Code incorrect. Réessayez.")
        setSaisie("")
        return
      }
      setSaisie("")
      setErreur(null)
      setVerrouille(false)
      armer()
    },
    [aUnCode, armer, settings.lockHash, updateSettings]
  )

  const contexte = useMemo(
    () => ({ verrouiller: () => setVerrouille("manuel"), possible: aUnCode }),
    [aUnCode]
  )

  if (!verrouille) {
    return (
      <Contexte.Provider value={contexte}>
        {children}
        {!aUnCode && ready && (
          <Ecran
            titre="Choisissez un code de reprise"
            texte="Quatre chiffres, pour rouvrir le terminal après une pause — sans réseau et sans refaire l'authentification."
            saisie={saisie}
            erreur={erreur}
            onSaisie={setSaisie}
            action="Enregistrer le code"
            onValider={() => void valider(saisie)}
            note="Le code est vérifié sur ce terminal. Seule son empreinte y est conservée."
          />
        )}
      </Contexte.Provider>
    )
  }

  return (
    <Ecran
      titre="Terminal verrouillé"
      texte={
        verrouille === "manuel"
          ? "Session ouverte, verrouillée par l'agent. Vos écritures locales sont intactes."
          : "Session ouverte, inactive depuis 5 min. Vos écritures locales sont intactes."
      }
      saisie={saisie}
      erreur={erreur}
      onSaisie={(valeur) => {
        setSaisie(valeur)
        setErreur(null)
        // Quatre chiffres suffisent : l'agent, gants aux mains, n'a pas à
        // viser un bouton de plus.
        if (valeur.length === LONGUEUR) void valider(valeur)
      }}
      action="Déverrouiller"
      onValider={() => void valider(saisie)}
      note={
        <>
          <span className="tabular">{queue.total}</span>{" "}
          {queue.total > 1 ? "écritures" : "écriture"} en attente d&apos;envoi.
          Le déverrouillage se fait sans réseau : le code est vérifié
          localement.
        </>
      }
    />
  )
}

function Ecran({
  titre,
  texte,
  saisie,
  erreur,
  onSaisie,
  action,
  onValider,
  note,
}: {
  titre: string
  texte: string
  saisie: string
  erreur: string | null
  onSaisie: (valeur: string) => void
  action: string
  onValider: () => void
  note: ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verrou-titre"
      className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col bg-canvas text-ink"
    >
      <BandeauService />
      <form
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        onSubmit={(event) => {
          event.preventDefault()
          onValider()
        }}
      >
        <span className="grid size-16 place-items-center rounded-pill bg-surface-sunk text-ink-muted">
          <LockIcon aria-hidden className="size-7" />
        </span>
        <h1 id="verrou-titre" className="text-[24px] font-bold">
          {titre}
        </h1>
        <p className="text-small max-w-[30ch] text-ink-muted">{texte}</p>
        <div className="grid w-[248px] gap-2">
          <CodeOtp
            valeur={saisie}
            onChange={onSaisie}
            longueur={LONGUEUR}
            invalide={Boolean(erreur)}
            masque
            autoFocus
            label="Code de reprise à quatre chiffres"
          />
          {erreur && (
            <p
              role="alert"
              className="text-[13px] font-semibold text-danger-ink"
            >
              {erreur}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" block className={TERRAIN}>
          {action}
        </Button>
        <p className="max-w-[34ch] text-[12.5px] leading-[1.45] font-medium text-ink-muted">
          {note}
        </p>
      </form>
    </div>
  )
}
