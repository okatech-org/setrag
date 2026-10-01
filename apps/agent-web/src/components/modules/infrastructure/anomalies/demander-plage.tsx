"use client"

import { CalendarRange } from "lucide-react"
import { useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { Switch } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"

import { useOperation } from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { infraApi } from "../commun"
import { AIDE_PK, arrondiPk, TYPES_INTERVENTION, type CategorieAnomalie, type TypeIntervention } from "../accueil/partage"

/** Champ « date et heure » (heure de Libreville) → horodatage. */
export function horodatageLibreville(valeur: string | undefined) {
  if (!valeur) return Number.NaN
  return Date.parse(`${valeur.length === 16 ? `${valeur}:00` : valeur}+01:00`)
}

/** Horodatage → valeur d'un champ `datetime-local`, à l'heure de Libreville. */
export function champDateHeure(horodatage: number) {
  const morceaux = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Libreville",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(horodatage)
  const part = (type: string) => morceaux.find((m) => m.type === type)?.value ?? "00"
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

/** Type de plage proposé selon la catégorie de l'anomalie. */
function typeDepuisCategorie(categorie: CategorieAnomalie): TypeIntervention {
  if (categorie === "ouvrage") return "ouvrage"
  if (categorie === "signalisation" || categorie === "passage_niveau") return "signalisation"
  if (categorie === "telecoms") return "telecoms"
  if (categorie === "vegetation") return "debroussaillage"
  return "entretien_voie"
}

/**
 * Demande d'une plage travaux pour traiter une anomalie : le responsable PRN
 * l'accorde ensuite depuis la rubrique « Plages travaux ».
 */
export function DialoguePlageTravaux({
  open,
  onOpenChange,
  anomalie,
  onDemandee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anomalie: { id: string; numero: string; pk: number; categorie: CategorieAnomalie; brigade: string | null }
  /** Après l'enregistrement, avec le numéro attribué. */
  onDemandee?: (numero: string) => void
}) {
  const demander = useMutation(infraApi.mutations.demanderIntervention)
  const operation = useOperation()
  const [interruption, setInterruption] = useState(false)
  const [debutDefaut] = useState(() => {
    const demain = new Date(Date.now() + 86_400_000)
    return `${champDateHeure(demain.getTime()).slice(0, 10)}T08:00`
  })
  const finDefaut = `${debutDefaut.slice(0, 10)}T12:00`

  const fermer = (ouvert: boolean) => {
    if (!ouvert) operation.effacer()
    onOpenChange(ouvert)
  }

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={fermer}
      titre={`Demander une plage travaux pour ${anomalie.numero}`}
      description="La demande part au responsable PRN, qui l'accorde ou la refuse. Une plage ne dépasse pas 72 heures."
      libelleValider={
        <>
          <CalendarRange />
          Envoyer la demande
        </>
      }
      enCours={operation.enCours === "plage"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const pkDebut = nombreSaisi(donnees, "pkDebut")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const debutLe = horodatageLibreville(texte(donnees, "debut"))
        const finLe = horodatageLibreville(texte(donnees, "fin"))
        if (pkDebut === undefined || pkFin === undefined || [pkDebut, pkFin, debutLe, finLe].some(Number.isNaN)) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Renseignez la plage PK et le créneau (date et heure)." })
          return
        }
        const resultat = await operation.executer("plage", () =>
          demander({
            libelle: String(donnees.get("libelle") ?? ""),
            type: String(donnees.get("type")) as TypeIntervention,
            pkDebut,
            pkFin,
            debutLe,
            finLe,
            interruption,
            equipe: String(donnees.get("equipe") ?? ""),
            anomalieId: anomalie.id as never,
          })
        )
        if (resultat) {
          setInterruption(false)
          fermer(false)
          onDemandee?.(resultat.numero)
        }
      }}
    >
      <Field label="Libellé" htmlFor="plage-libelle">
        <Input id="plage-libelle" name="libelle" required maxLength={200} defaultValue={`Traitement de ${anomalie.numero}`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature des travaux" htmlFor="plage-type">
          <SelectNative id="plage-type" name="type" defaultValue={typeDepuisCategorie(anomalie.categorie)}>
            {Object.entries(TYPES_INTERVENTION).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Équipe" htmlFor="plage-equipe">
          <Input id="plage-equipe" name="equipe" required maxLength={200} defaultValue={anomalie.brigade ?? ""} placeholder="Brigade voie de Ndjolé, 6 agents" />
        </Field>
        <Field label="PK de début" htmlFor="plage-pk-debut" hint={AIDE_PK}>
          <Input id="plage-pk-debut" name="pkDebut" inputMode="decimal" required className="tabular" defaultValue={String(arrondiPk(Math.max(0, anomalie.pk - 0.5))).replace(".", ",")} />
        </Field>
        <Field label="PK de fin" htmlFor="plage-pk-fin">
          <Input id="plage-pk-fin" name="pkFin" inputMode="decimal" required className="tabular" defaultValue={String(arrondiPk(anomalie.pk + 0.5)).replace(".", ",")} />
        </Field>
        <Field label="Début (heure de Libreville)" htmlFor="plage-debut">
          <Input id="plage-debut" name="debut" type="datetime-local" required className="tabular" defaultValue={debutDefaut} />
        </Field>
        <Field label="Fin (heure de Libreville)" htmlFor="plage-fin">
          <Input id="plage-fin" name="fin" type="datetime-local" required className="tabular" defaultValue={finDefaut} />
        </Field>
      </div>
      <Switch
        checked={interruption}
        onCheckedChange={setInterruption}
        label={interruption ? "Coupure de voie : aucun train ne passe pendant la plage" : "Travaux sous circulation (pas de coupure de voie)"}
      />
    </FenetreFormulaire>
  )
}
