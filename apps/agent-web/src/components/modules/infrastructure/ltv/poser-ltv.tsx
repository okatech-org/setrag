"use client"

import { Gauge } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOperation } from "@/components/gestion/referentiels/elements"
import { aujourdhuiService, finJour } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"
import { signalerNavigation } from "@/coquille/filet-navigation"

import { infraApi, minutes, pk as fmtPk } from "../commun"
import { AIDE_PK, arrondiPk, GRAVITES, LONGUEUR_LIGNE_KM, sectionsRecoupees } from "../accueil/partage"

/** Pénalité de freinage et de relance, comme le calcul du serveur. */
const PENALITE_FREINAGE_MIN = 1

/** Perte de temps indicative d'un train sur la zone (le serveur fait foi). */
export function perteEstimee(longueurKm: number, vitesseKmh: number, nominaleKmh: number) {
  if (!(longueurKm > 0) || !(vitesseKmh > 0) || vitesseKmh >= nominaleKmh) return null
  return Math.round((longueurKm * (60 / vitesseKmh - 60 / nominaleKmh) + PENALITE_FREINAGE_MIN) * 10) / 10
}

export interface AnomalieSource {
  id: string
  numero: string
  pk: number
  description: string
}

/**
 * Pose d'une limitation temporaire de vitesse. Le serveur refuse une vitesse
 * égale ou supérieure à la nominale de la plage, et toute plage recouvrant
 * une LTV active : son message est affiché tel quel.
 */
export function DialoguePoseLtv({
  open,
  onOpenChange,
  anomalie,
  onPosee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Anomalie d'origine : préremplit la plage autour de son PK et la lie. */
  anomalie?: AnomalieSource
  /** Après la pose ; par défaut, ouvre le dossier de la LTV. */
  onPosee?: (ltvId: string) => void
}) {
  const router = useRouter()
  const formulaires = useQuery(infraApi.queries.formulaires, open ? {} : "skip")
  const poser = useMutation(infraApi.mutations.poserLtv)
  const operation = useOperation()
  const longueur = formulaires?.sections.reduce((max, s) => Math.max(max, s.pkFin), 0) || LONGUEUR_LIGNE_KM
  const [debut, setDebut] = useState(() => (anomalie ? String(arrondiPk(Math.max(0, anomalie.pk - 0.2))).replace(".", ",") : ""))
  const [fin, setFin] = useState(() => (anomalie ? String(arrondiPk(Math.min(longueur, anomalie.pk + 0.2))).replace(".", ",") : ""))
  const [vitesse, setVitesse] = useState("")

  const lire = (valeur: string) => (valeur.trim() === "" ? Number.NaN : Number(valeur.replace(",", ".").replace(/\s/g, "")))
  const a = lire(debut)
  const b = lire(fin)
  const v = lire(vitesse)
  const plageLisible = Number.isFinite(a) && Number.isFinite(b) && a < b
  const recoupees = plageLisible && formulaires ? sectionsRecoupees(formulaires.sections, a, b) : []
  const nominale = recoupees.length > 0 ? Math.min(...recoupees.map((s) => s.vitesseNominaleKmh)) : null
  const perte = nominale !== null && Number.isFinite(v) ? perteEstimee(b - a, v, nominale) : null

  const fermer = (ouvert: boolean) => {
    if (!ouvert) operation.effacer()
    onOpenChange(ouvert)
  }

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={fermer}
      titre={anomalie ? `Poser une LTV sur ${anomalie.numero}` : "Poser une limitation de vitesse"}
      description="La LTV s'applique dès l'enregistrement et entre dans le calcul des pertes de temps des trains."
      libelleValider={
        <>
          <Gauge />
          Poser la LTV
        </>
      }
      enCours={operation.enCours === "poser"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const pkDebut = nombreSaisi(donnees, "pkDebut")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const vitesseKmh = nombreSaisi(donnees, "vitesse")
        if (pkDebut === undefined || pkFin === undefined || vitesseKmh === undefined || [pkDebut, pkFin, vitesseKmh].some(Number.isNaN)) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Renseignez les deux PK et la vitesse en chiffres." })
          return
        }
        const dateFin = texte(donnees, "finPrevue")
        const resultat = await operation.executer("poser", () =>
          poser({
            pkDebut,
            pkFin,
            vitesseKmh,
            motif: String(donnees.get("motif") ?? ""),
            finPrevueLe: dateFin ? finJour(dateFin) : undefined,
            anomalieId: (anomalie?.id ?? texte(donnees, "anomalieId")) as never,
          })
        )
        if (resultat) {
          fermer(false)
          if (onPosee) onPosee(resultat.ltvId)
          else {
            signalerNavigation()
            router.push(`/infrastructures/ltv/${resultat.ltvId}` as Route)
          }
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="PK de début" htmlFor="ltv-pk-debut" hint={AIDE_PK}>
          <Input id="ltv-pk-debut" name="pkDebut" inputMode="decimal" required value={debut} onChange={(e) => setDebut(e.target.value)} placeholder="201,2" className="tabular" autoComplete="off" />
        </Field>
        <Field label="PK de fin" htmlFor="ltv-pk-fin" hint={`Au plus PK ${longueur}.`}>
          <Input id="ltv-pk-fin" name="pkFin" inputMode="decimal" required value={fin} onChange={(e) => setFin(e.target.value)} placeholder="201,8" className="tabular" autoComplete="off" />
        </Field>
      </div>
      {plageLisible && formulaires ? (
        recoupees.length > 0 ? (
          <p className="text-small text-ink-muted">
            Plage de <span className="tabular">{arrondiPk(b - a).toLocaleString("fr-FR")} km</span> sur{" "}
            {recoupees.map((s) => s.code).join(", ")} · vitesse nominale <span className="tabular">{nominale} km/h</span>.
          </p>
        ) : (
          <InlineMessage tone="warning" title="Aucune section ne couvre cette plage.">
            Vérifiez les PK : la LTV ne peut être posée que sur une section de voie renseignée.
          </InlineMessage>
        )
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Vitesse limitée (km/h)"
          htmlFor="ltv-vitesse"
          hint={nominale !== null ? `Inférieure à ${nominale} km/h, 10 km/h au moins.${perte !== null ? ` Perte estimée : ${minutes(perte)} par train.` : ""}` : "Inférieure à la vitesse nominale de la plage."}
        >
          <Input id="ltv-vitesse" name="vitesse" inputMode="numeric" required value={vitesse} onChange={(e) => setVitesse(e.target.value)} placeholder="30" className="tabular" autoComplete="off" />
        </Field>
        <Field label="Fin prévue (facultatif)" htmlFor="ltv-fin-prevue" hint="Sans date, la LTV reste active jusqu'à sa levée.">
          <Input id="ltv-fin-prevue" name="finPrevue" type="date" min={aujourdhuiService()} className="tabular" />
        </Field>
      </div>
      <Field label="Motif" htmlFor="ltv-motif">
        <Textarea
          id="ltv-motif"
          name="motif"
          required
          maxLength={500}
          defaultValue={anomalie ? `${anomalie.numero} : ${anomalie.description}`.slice(0, 500) : undefined}
          placeholder="Nivellement dégradé après fortes pluies, en attente de bourrage."
        />
      </Field>
      {anomalie ? (
        <p className="text-small text-ink-muted">
          Liée à l&apos;anomalie <b className="tabular">{anomalie.numero}</b> ({fmtPk(anomalie.pk)}).
        </p>
      ) : (
        <Field label="Anomalie à l'origine (facultatif)" htmlFor="ltv-anomalie">
          <SelectNative id="ltv-anomalie" name="anomalieId" defaultValue="">
            <option value="">Aucune</option>
            {formulaires?.anomaliesOuvertes.map((an) => (
              <option key={an.id} value={an.id}>
                {an.numero} · {fmtPk(an.pk)} · {GRAVITES[an.gravite].libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      )}
    </FenetreFormulaire>
  )
}
