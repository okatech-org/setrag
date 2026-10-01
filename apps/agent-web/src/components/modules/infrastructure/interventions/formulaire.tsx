"use client"

import { CalendarPlus } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"

import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { infraApi, type FormulairesInfra } from "../commun"
import { depuisChampDateHeure, erreurOperation, refuser, versChampDateHeure, type Operation } from "./partage"
import { DUREE_MAX_HEURES, TYPES_INTERVENTION, type TypeIntervention } from "./libelles"

type IdChantier = FormulairesInfra["chantiers"][number]["id"]
type IdAnomalie = FormulairesInfra["anomaliesOuvertes"][number]["id"]

const HEURE = 3_600_000

/**
 * Demande de plage travaux : la plage PK, le créneau, le régime de
 * circulation. Elle part « demandée » ; un autre agent l'accorde si elle
 * n'entre en conflit avec aucune plage active.
 */
export function FenetreDemandeIntervention({
  open,
  onOpenChange,
  operation,
  chantierInitial,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  /** Demande ouverte depuis un chantier : il est présélectionné, sa plage proposée. */
  chantierInitial?: { id: string; pkDebut: number; pkFin: number }
  onCree?: (interventionId: string) => void
}) {
  const demander = useMutation(infraApi.mutations.demanderIntervention)
  const formulaires = useQuery(infraApi.queries.formulaires, open ? {} : "skip")
  const [defauts] = useState(() => {
    const demain = Math.ceil((Date.now() + 24 * HEURE) / HEURE) * HEURE
    return { debut: versChampDateHeure(demain), fin: versChampDateHeure(demain + 6 * HEURE) }
  })
  const [chantierId, setChantierId] = useState(chantierInitial?.id ?? "")
  const chantiers = formulaires?.chantiers.filter((c) => c.statut !== "receptionne") ?? []

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Demander une plage travaux"
      description={`La plage ne dépasse pas ${DUREE_MAX_HEURES} heures. Une coupure de voie suspend la circulation sur la plage PK : les trains concernés sont listés dans le dossier.`}
      libelleValider={
        <>
          <CalendarPlus />
          Envoyer la demande
        </>
      }
      enCours={operation.enCours === "demande"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const pkDebut = nombreSaisi(donnees, "pkDebut")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const debutLe = depuisChampDateHeure(String(donnees.get("debutLe") ?? ""))
        const finLe = depuisChampDateHeure(String(donnees.get("finLe") ?? ""))
        const regimeChoisi = String(donnees.get("regime") ?? "")
        if (pkDebut === undefined || pkFin === undefined || Number.isNaN(pkDebut) || Number.isNaN(pkFin)) return refuser(operation, "Les PK de début et de fin sont des nombres (par exemple 182,4).")
        if (pkFin <= pkDebut) return refuser(operation, "Le PK de fin doit dépasser le PK de début.")
        if (Number.isNaN(debutLe) || Number.isNaN(finLe)) return refuser(operation, "Le début et la fin du créneau sont obligatoires.")
        if (finLe <= debutLe) return refuser(operation, "La fin de la plage travaux doit suivre son début.")
        if (finLe - debutLe > DUREE_MAX_HEURES * HEURE) return refuser(operation, `Une plage travaux ne dépasse pas ${DUREE_MAX_HEURES} heures : scindez la demande.`)
        if (regimeChoisi !== "coupure" && regimeChoisi !== "circulation") return refuser(operation, "Précisez le régime : coupure de voie ou travaux sous circulation.")
        const resultat = await operation.executer(
          "demande",
          () =>
            demander({
              libelle: texte(donnees, "libelle") ?? "",
              type: String(donnees.get("type")) as TypeIntervention,
              pkDebut,
              pkFin,
              debutLe,
              finLe,
              interruption: regimeChoisi === "coupure",
              equipe: texte(donnees, "equipe") ?? "",
              chantierId: texte(donnees, "chantierId") as IdChantier | undefined,
              anomalieId: texte(donnees, "anomalieId") as IdAnomalie | undefined,
            }),
          (r) => `Plage travaux ${r.numero} demandée.`
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.interventionId)
        }
      }}
    >
      <Field label="Libellé" htmlFor="intervention-libelle">
        <Input id="intervention-libelle" name="libelle" required maxLength={200} placeholder="Remplacement de traverses entre Ndjolé et Alembé" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type de travaux" htmlFor="intervention-type">
          <SelectNative id="intervention-type" name="type" defaultValue={chantierInitial ? "prn" : "entretien_voie"}>
            {Object.entries(TYPES_INTERVENTION).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="PK de début" hint="De 0 (Owendo) à 669." htmlFor="intervention-pk-debut">
          <Input id="intervention-pk-debut" name="pkDebut" required inputMode="decimal" className="tabular" defaultValue={chantierInitial?.pkDebut} />
        </Field>
        <Field label="PK de fin" htmlFor="intervention-pk-fin">
          <Input id="intervention-pk-fin" name="pkFin" required inputMode="decimal" className="tabular" defaultValue={chantierInitial?.pkFin} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début (heure de Libreville)" htmlFor="intervention-debut">
          <Input id="intervention-debut" name="debutLe" type="datetime-local" required defaultValue={defauts.debut} className="tabular" />
        </Field>
        <Field label="Fin (heure de Libreville)" hint={`${DUREE_MAX_HEURES} heures au plus.`} htmlFor="intervention-fin">
          <Input id="intervention-fin" name="finLe" type="datetime-local" required defaultValue={defauts.fin} className="tabular" />
        </Field>
      </div>
      <fieldset className="grid gap-1">
        <legend className="text-[13px] font-medium">Régime de circulation</legend>
        <RadioGroup name="regime" required aria-label="Régime de circulation">
          <Radio value="coupure" label="Coupure de voie : aucun train ne circule sur la plage" />
          <Radio value="circulation" label="Sous circulation : les trains passent, travaux protégés" />
        </RadioGroup>
      </fieldset>
      <Field label="Équipe" htmlFor="intervention-equipe">
        <Input id="intervention-equipe" name="equipe" required maxLength={200} placeholder="Brigade voie de Ndjolé (12 agents)" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chantier PRN (facultatif)" htmlFor="intervention-chantier">
          <SelectNative id="intervention-chantier" name="chantierId" value={chantierId} onChange={(e) => setChantierId(e.target.value)}>
            <option value="">Aucun chantier</option>
            {chantierId && !chantiers.some((c) => c.id === chantierId) ? <option value={chantierId}>Chantier en cours de chargement…</option> : null}
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Anomalie traitée (facultatif)" htmlFor="intervention-anomalie">
          <SelectNative id="intervention-anomalie" name="anomalieId" defaultValue="">
            <option value="">Aucune anomalie</option>
            {formulaires?.anomaliesOuvertes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.numero} · PK {a.pk} · {a.description.length > 50 ? `${a.description.slice(0, 48)}…` : a.description}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
    </FenetreFormulaire>
  )
}
