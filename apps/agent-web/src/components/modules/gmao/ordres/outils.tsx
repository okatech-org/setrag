"use client"

import type { Route } from "next"
import Link from "next/link"
import { Component, useState, type ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { EvenementChronologie } from "@/components/charte"
import { dateHeure, heure, jourMois, messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"

/*
 * Outils partagés par les écrans OT, stock et achats du module GMAO :
 * fenêtre d'action serveur, garde des dossiers, dates de Libreville,
 * chronologie et liens internes.
 */

/* ======================================================== Dates (UTC+1) */

const HEURE_MS = 3_600_000

/** Horodatage → valeur d'un champ `datetime-local` à l'heure de Libreville (UTC+1, sans heure d'été). */
export function champDateHeure(valeur: number | null | undefined) {
  if (!valeur) return ""
  return new Date(valeur + HEURE_MS).toISOString().slice(0, 16)
}

/** Valeur d'un champ `datetime-local` (heure de Libreville) → horodatage, `NaN` si invalide. */
export function lireDateHeure(valeur: string) {
  if (!valeur) return Number.NaN
  return Date.parse(`${valeur}:00+01:00`)
}

/** Durée lisible : « 3 j 4 h », « 5 h », « 40 min ». */
export function duree(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `${heures} h`
  const jours = Math.floor(heures / 24)
  const reste = heures % 24
  return reste ? `${jours} j ${reste} h` : `${jours} j`
}

/* =========================================================== Chronologie */

export interface EvenementGmao {
  id: string
  libelle: string
  detail: string | null
  auteur: string | null
  le: number
}

/** Événements du journal GMAO → chronologie de la charte. */
export function chronologieGmao(evenements: readonly EvenementGmao[]): EvenementChronologie[] {
  return evenements.map((evenement) => ({
    cle: evenement.id,
    heure: jourMois(evenement.le),
    titre: evenement.libelle,
    detail: [heure(evenement.le), evenement.auteur ?? "Système", evenement.detail].filter(Boolean).join(" · "),
  }))
}

/* ================================================================= Liens */

/**
 * Lien interne dans une cellule de tableau : il n'active pas le clic de la
 * ligne (qui ouvre un autre dossier).
 */
export function LienInterne({ href, children, mono, className }: { href: string; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <Link
      href={href as Route}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn("font-semibold text-accent-ink underline-offset-2 hover:underline", mono && "tabular", className)}
    >
      {children}
    </Link>
  )
}

/** Horodatage court en chiffres alignés. */
export function Horodatage({ le }: { le: number | null | undefined }) {
  return <span className="tabular">{dateHeure(le)}</span>
}

/* ======================================================= Fenêtre d'action */

/**
 * Formulaire en feuille qui exécute une mutation : l'erreur du serveur
 * (« Stock insuffisant… ») reste dans la fenêtre, la réussite remonte à
 * l'écran. `action` lève une `Error` pour refuser une saisie côté client.
 */
export function FenetreAction({
  open,
  onOpenChange,
  titre,
  description,
  libelleValider,
  variante,
  large,
  action,
  onSucces,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: ReactNode
  description?: ReactNode
  libelleValider: ReactNode
  variante?: "primary" | "danger"
  large?: boolean
  /** Exécute l'action et rend le message de réussite. */
  action: (donnees: FormData) => Promise<string>
  onSucces?: (message: string) => void
  children: ReactNode
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={titre}
      description={description}
      libelleValider={libelleValider}
      variante={variante}
      large={large}
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees) => {
        setErreur(null)
        setEnCours(true)
        try {
          const message = await action(donnees)
          onOpenChange(false)
          onSucces?.(message)
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {children}
    </FenetreFormulaire>
  )
}

/** Lecture d'une quantité saisie (virgule acceptée) ; lève une erreur lisible. */
export function quantiteSaisie(donnees: FormData, cle: string, libelle = "La quantité") {
  const brut = String(donnees.get(cle) ?? "").trim().replace(",", ".").replace(/\s/g, "")
  const valeur = Number(brut)
  if (brut === "" || !Number.isFinite(valeur)) throw new Error(`${libelle} est à renseigner en chiffres.`)
  return valeur
}

/** Texte obligatoire d'un formulaire ; lève une erreur lisible. */
export function texteObligatoire(donnees: FormData, cle: string, libelle: string) {
  const valeur = String(donnees.get(cle) ?? "").trim()
  if (!valeur) throw new Error(`${libelle} est obligatoire.`)
  return valeur
}

/* ======================================================== Garde de dossier */

const VALIDATION_ID = /ArgumentValidationError|does not match validator|Invalid argument|not a valid ID|Found ID .* from table/i

/**
 * Un identifiant mal formé dans l'URL fait lever la validation des
 * arguments par Convex : on le présente comme un dossier introuvable plutôt
 * que comme une panne. Les autres erreurs remontent à la page d'erreur.
 * À monter avec `key={identifiant}` pour repartir de zéro à chaque dossier.
 */
export class GardeDossier extends Component<{ secours: ReactNode; children: ReactNode }, { erreur: unknown }> {
  state: { erreur: unknown } = { erreur: null }

  static getDerivedStateFromError(erreur: unknown) {
    return { erreur }
  }

  render() {
    const { erreur } = this.state
    if (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur)
      if (VALIDATION_ID.test(message)) return this.props.secours
      throw erreur
    }
    return this.props.children
  }
}
