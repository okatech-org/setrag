"use client"

import { useId, type FormEvent, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Formulaire en feuille : monte du bas sur mobile, fenêtre centrée au-delà.
 * Le bouton de validation, collé en bas, soumet le formulaire par son `id`.
 */
export function FenetreFormulaire({
  open,
  onOpenChange,
  titre,
  description,
  onSubmit,
  libelleValider,
  enCours,
  erreur,
  variante = "primary",
  large,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: ReactNode
  description?: ReactNode
  onSubmit: (donnees: FormData, formulaire: HTMLFormElement) => void | Promise<void>
  libelleValider: ReactNode
  enCours?: boolean
  erreur?: string | null
  variante?: "primary" | "danger"
  /** Fenêtre élargie pour les grilles et tableaux. */
  large?: boolean
  children: ReactNode
}) {
  const id = useId()
  const soumettre = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit(new FormData(event.currentTarget), event.currentTarget)
  }
  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre={titre}
      description={description}
      className={cn(large && "md:w-[min(820px,94vw)]")}
      pied={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form={id} variant={variante} loading={enCours} loadingLabel="Enregistrement…">
            {libelleValider}
          </Button>
        </div>
      }
    >
      <form id={id} onSubmit={soumettre} className="grid gap-4 pt-1">
        {erreur ? (
          <InlineMessage tone="danger" title="Enregistrement refusé">
            {erreur}
          </InlineMessage>
        ) : null}
        {children}
      </form>
    </Feuille>
  )
}

/** Lecture d'un champ texte facultatif. */
export function texte(donnees: FormData, cle: string) {
  const valeur = String(donnees.get(cle) ?? "").trim()
  return valeur === "" ? undefined : valeur
}

/** Lecture d'un nombre facultatif (virgule décimale acceptée). */
export function nombreSaisi(donnees: FormData, cle: string) {
  const valeur = String(donnees.get(cle) ?? "").trim().replace(",", ".").replace(/\s/g, "")
  if (valeur === "") return undefined
  const n = Number(valeur)
  return Number.isFinite(n) ? n : Number.NaN
}
