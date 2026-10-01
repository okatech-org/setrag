"use client"

import { ListPlus } from "lucide-react"
import { useId, type ReactNode } from "react"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"

import { useOperation } from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import { aujourdhui, type Id } from "@/components/modules/rh/commun"

import {
  DIRECTIONS_RESPONSABLES,
  PRIORITES,
  type DirectionResponsable,
  type Priorite,
} from "./libelles"

/**
 * Dialogue à un seul champ de texte (motif, note, référence) : l'erreur du
 * serveur s'affiche dans la fenêtre, qui ne se ferme qu'en cas de succès.
 */
export function DialogueTexte({
  open,
  onOpenChange,
  titre,
  description,
  libelle,
  aide,
  libelleValider,
  variante,
  multiligne = true,
  requis = true,
  valeurInitiale,
  enPlus,
  onValider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: string
  description?: ReactNode
  libelle: string
  aide?: string
  libelleValider: ReactNode
  variante?: "primary" | "danger"
  multiligne?: boolean
  requis?: boolean
  valeurInitiale?: string
  /** Champs supplémentaires (lus par l'appelant dans le FormData). */
  enPlus?: ReactNode
  onValider: (texte: string, donnees: FormData) => Promise<unknown>
}) {
  const operation = useOperation()
  const id = useId()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={titre}
      description={description}
      libelleValider={libelleValider}
      variante={variante}
      enCours={operation.enCours === "texte"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const valeur = String(d.get("texte") ?? "")
        const resultat = await operation.executer(
          "texte",
          async () => (await onValider(valeur, d)) ?? true
        )
        if (resultat !== undefined) onOpenChange(false)
      }}
    >
      {enPlus}
      <Field label={libelle} htmlFor={id} hint={aide}>
        {multiligne ? (
          <Textarea
            id={id}
            name="texte"
            required={requis}
            rows={4}
            defaultValue={valeurInitiale}
          />
        ) : (
          <Input
            id={id}
            name="texte"
            required={requis}
            defaultValue={valeurInitiale}
            autoComplete="off"
          />
        )}
      </Field>
    </FenetreFormulaire>
  )
}

export type SourceAction =
  | { enqueteId: Id<"securiteEnquetes"> }
  | { evenementId: Id<"securiteEvenements"> }
  | { inspectionId: Id<"securiteInspections">; nonConformiteCode?: string }

/** Inscription d'une action corrective au plan, rattachée à une seule source. */
export function DialogueAction({
  open,
  onOpenChange,
  source,
  contexte,
  libelleInitial,
  onCreee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: SourceAction
  /** Rappel de la source (« Enquête ENQ-2026-004 », « NC INS-2026-003-NC1 »…). */
  contexte: string
  libelleInitial?: string
  onCreee?: (resultat: { actionId: string; numero: string }) => void
}) {
  const creer = useMutation(api.modules.securite.actions.creer)
  const operation = useOperation()
  const base = useId()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Ajouter une action corrective"
      description={`${contexte}. L'action entre au plan comme « planifiée » ; son efficacité sera vérifiée après réalisation.`}
      libelleValider={
        <>
          <ListPlus />
          Inscrire au plan
        </>
      }
      enCours={operation.enCours === "action"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("action", () =>
          creer({
            ...source,
            libelle: String(d.get("libelle") ?? ""),
            responsableNom: String(d.get("responsableNom") ?? ""),
            responsableDirection: String(
              d.get("direction")
            ) as DirectionResponsable,
            echeance: String(d.get("echeance") ?? ""),
            priorite: String(d.get("priorite")) as Priorite,
          })
        )
        if (resultat) {
          onOpenChange(false)
          onCreee?.(resultat)
        }
      }}
    >
      <Field label="Action à mener" htmlFor={`${base}-libelle`}>
        <Textarea
          id={`${base}-libelle`}
          name="libelle"
          required
          rows={3}
          defaultValue={libelleInitial}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Responsable"
          htmlFor={`${base}-responsable`}
          hint="Nom et fonction du porteur de l'action."
        >
          <Input
            id={`${base}-responsable`}
            name="responsableNom"
            required
            autoComplete="off"
          />
        </Field>
        <Field label="Direction" htmlFor={`${base}-direction`}>
          <SelectNative
            id={`${base}-direction`}
            name="direction"
            defaultValue="DSED"
          >
            {Object.entries(DIRECTIONS_RESPONSABLES).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {cle} · {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Échéance" htmlFor={`${base}-echeance`}>
          <Input
            id={`${base}-echeance`}
            name="echeance"
            type="date"
            required
            min={aujourdhui()}
            defaultValue={aujourdhui(30)}
          />
        </Field>
        <Field label="Priorité" htmlFor={`${base}-priorite`}>
          <SelectNative
            id={`${base}-priorite`}
            name="priorite"
            defaultValue="normale"
          >
            {Object.entries(PRIORITES).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
    </FenetreFormulaire>
  )
}
