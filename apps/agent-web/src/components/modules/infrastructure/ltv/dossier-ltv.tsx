"use client"

import { CircleCheck, Clock, Gauge, History, Pencil, TrainFront, TriangleAlert } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { aujourdhuiService, champDate, dateHeure, dateService, finJour, heure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import {
  CadreInfra,
  DossierEnChargement,
  DossierIntrouvable,
  infraApi,
  kmh,
  minutes,
  plagePk,
  TagEtat,
  TagRetard,
  useDroitsInfra,
  type DossierLtv,
} from "../commun"
import { SchemaVoie } from "../schema-voie"
import { chronologieInfra, useLigne, zonesLtv } from "../accueil/partage"

const RETOUR = { href: "/infrastructures/ltv", libelle: "Limitations de vitesse" }
const fmtMin = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

type TrainImpacte = DossierLtv["trainsImpactes"][number]

const TYPES_TRAIN: Record<string, string> = { EXPRESS: "Express", OMNIBUS: "Omnibus", AUTORAIL: "Autorail", SPECIAL: "Spécial" }

export const colonnesTrains: ColonneTableau<TrainImpacte>[] = [
  {
    cle: "train",
    libelle: "Train",
    rendu: (t) => <CelluleDouble mono haut={t.trainNumber} bas={TYPES_TRAIN[t.trainType] ?? t.trainType} />,
    tri: (t) => t.trainNumber,
  },
  { cle: "date", libelle: "Date", rendu: (t) => dateService(t.serviceDate), tri: (t) => t.serviceDate },
  { cle: "depart", libelle: "Départ", rendu: (t) => <span className="tabular">{heure(t.departureAt)}</span>, tri: (t) => t.departureAt, export: (t) => dateHeure(t.departureAt) },
  { cle: "parcours", libelle: "Parcours", rendu: (t) => `${t.origine} → ${t.destination}`, tri: (t) => `${t.origine} ${t.destination}` },
  { cle: "perte", libelle: "Perte estimée", rendu: (t) => <span className="tabular">{minutes(t.perteTempsMinutes)}</span>, tri: (t) => t.perteTempsMinutes, numerique: true },
]

export function DossierLtvEcran({ ltvId }: { ltvId: string }) {
  const dossier = useQuery(infraApi.queries.ltv, { ltvId: ltvId as never })
  if (dossier === undefined) {
    return (
      <CadreInfra titre="Limitation de vitesse" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="LTV introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Limitation de vitesse" retour={RETOUR} />
      </CadreInfra>
    )
  }
  return <DossierLtvVue dossier={dossier} />
}

export function DossierLtvVue({ dossier }: { dossier: DossierLtv }) {
  const { ltv } = dossier
  const droits = useDroitsInfra()
  const ligne = useLigne()
  const operation = useOperation()
  const modifier = useMutation(infraApi.mutations.modifierLtv)
  const lever = useMutation(infraApi.mutations.leverLtv)
  const [fenetre, setFenetre] = useState<"modifier" | "lever" | null>(null)
  const active = ltv.statut === "active"
  const peutGerer = active && !droits.chargement && droits.peut("ltv_gerer")
  const erreurFenetre = operation.retour?.ton === "danger" ? operation.retour.detail : null
  const ouvrir = (f: "modifier" | "lever") => {
    operation.effacer()
    setFenetre(f)
  }

  return (
    <CadreInfra
      titre={`LTV ${ltv.numero}`}
      description={`${plagePk(ltv.pkDebut, ltv.pkFin)} · ${kmh(ltv.vitesseKmh)} au lieu de ${kmh(ltv.vitesseNominaleKmh)}${ltv.sectionLibelle ? ` · ${ltv.sectionLibelle}` : ""}`}
      retour={RETOUR}
      actions={
        peutGerer ? (
          <>
            <Button type="button" variant="secondary" onClick={() => ouvrir("modifier")}>
              <Pencil />
              Modifier
            </Button>
            <Button type="button" onClick={() => ouvrir("lever")}>
              <CircleCheck />
              Lever la LTV
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={ltv.statut} libelle={ltv.statutLibelle} />
        {ltv.echeanceDepassee ? <TagRetard texte="Échéance dépassée" /> : null}
      </div>
      <RetourOperation retour={fenetre ? null : operation.retour} />
      {ltv.echeanceDepassee ? (
        <InlineMessage tone="warning" title="La fin prévue est passée.">
          Levez la LTV si la voie est rendue, ou reportez sa fin prévue avec un motif.
        </InlineMessage>
      ) : null}

      <Panneau titre="Zone limitée" icone={Gauge} sousTitre={plagePk(ltv.pkDebut, ltv.pkFin)}>
        {ligne === undefined ? (
          <p className="text-small text-ink-muted" role="status">
            Chargement du schéma de ligne…
          </p>
        ) : (
          <SchemaVoie gares={ligne.gares} zones={zonesLtv([ltv]).map((z) => ({ ...z, href: undefined, detail: `${z.detail} · ${ltv.statutLibelle.toLowerCase()}` }))} segment={[ltv.pkDebut, ltv.pkFin]} />
        )}
      </Panneau>

      <Indicateurs colonnes={3}>
        <Indicateur libelle="Perte de temps par train" icone={Clock} valeur={fmtMin.format(ltv.perteTempsMinutes)} unite="min" />
        <Indicateur libelle="Trains impactés sur 7 jours" icone={TrainFront} valeur={active ? dossier.trainsImpactes.length : "—"} evolution={active ? undefined : { sens: "neutre", texte: "LTV levée : plus aucun train ralenti" }} />
        <Indicateur libelle="Perte cumulée sur 7 jours" icone={Clock} valeur={active ? fmtMin.format(dossier.perteTempsCumuleeMinutes) : "—"} unite={active ? "min" : undefined} />
      </Indicateurs>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Trains impactés" icone={TrainFront} sousTitre="Circulations des 7 prochains jours qui traversent la zone">
            {active ? (
              <TableauDonnees
                libelle={`Trains impactés par la LTV ${ltv.numero}`}
                colonnes={colonnesTrains}
                lignes={dossier.trainsImpactes}
                cle={(t) => t.id}
                exportNom={`trains-impactes-${ltv.numero}`}
                triInitial={{ cle: "depart", sens: "asc" }}
                parPage={15}
                vide={{ titre: "Aucun train programmé sur la zone", description: "Aucune circulation ne traverse cette plage dans les 7 prochains jours." }}
              />
            ) : (
              <p className="text-small text-ink-muted">La LTV est levée : elle ne ralentit plus aucun train.</p>
            )}
          </Panneau>
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieInfra(dossier.chronologie)} vide="Aucun événement tracé sur cette LTV." />
          </Panneau>
        </div>
        <div className="grid content-start gap-5">
          <Panneau titre="Limitation" icone={TriangleAlert}>
            <p className="text-[15px] whitespace-pre-line">{ltv.motif}</p>
            <Fiche
              elements={[
                ["Plage", <span key="p" className="tabular">{plagePk(ltv.pkDebut, ltv.pkFin)}</span>],
                ["Longueur", <span key="l" className="tabular">{ltv.longueurKm.toLocaleString("fr-FR")} km</span>],
                ["Section", ltv.sectionId ? <Link key="s" href={`/infrastructures/voie/${ltv.sectionId}` as Route} className="font-semibold text-accent-ink hover:underline">{ltv.sectionLibelle ?? "Voir la section"}</Link> : "—"],
                ["Vitesse limitée", <span key="v" className="tabular">{kmh(ltv.vitesseKmh)}</span>],
                ["Vitesse nominale", <span key="n" className="tabular">{kmh(ltv.vitesseNominaleKmh)}</span>],
                ["Posée", <span key="d"><span className="tabular">{dateHeure(ltv.debutLe)}</span> · {ltv.poseeParNom ?? "—"}</span>],
                ["Fin prévue", <span key="f" className="tabular">{ltv.finPrevueLe ? dateHeure(ltv.finPrevueLe) : "Non fixée"}</span>],
                ltv.leveeLe ? ["Levée", <span key="lv"><span className="tabular">{dateHeure(ltv.leveeLe)}</span> · {ltv.leveeParNom ?? "—"}</span>] : null,
                ltv.anomalieId ? ["Anomalie", <Link key="a" href={`/infrastructures/anomalies/${ltv.anomalieId}` as Route} className="tabular font-semibold text-accent-ink hover:underline">{ltv.anomalieNumero ?? "Voir l'anomalie"}</Link>] : null,
              ]}
            />
            {ltv.motifLevee ? (
              <InlineMessage tone="success" title="Motif de la levée">
                {ltv.motifLevee}
              </InlineMessage>
            ) : null}
          </Panneau>
          {dossier.anomalie ? (
            <Panneau titre="Anomalie à l'origine" icone={TriangleAlert}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/infrastructures/anomalies/${dossier.anomalie.id}` as Route} className="tabular inline-flex min-h-11 items-center font-semibold text-accent-ink hover:underline">
                  {dossier.anomalie.numero}
                </Link>
                <TagEtat valeur={dossier.anomalie.statut} libelle={dossier.anomalie.statutLibelle} />
                <TagEtat valeur={dossier.anomalie.gravite} libelle={dossier.anomalie.graviteLibelle} />
              </div>
              <p className="text-small text-ink-muted">{dossier.anomalie.description}</p>
            </Panneau>
          ) : null}
        </div>
      </div>

      <FenetreFormulaire
        open={fenetre === "modifier"}
        onOpenChange={(o) => !o && setFenetre(null)}
        titre={`Modifier la LTV ${ltv.numero}`}
        description={`Vitesse nominale de la plage : ${kmh(ltv.vitesseNominaleKmh)}. Renseignez une nouvelle vitesse, une nouvelle fin prévue, ou les deux.`}
        libelleValider="Enregistrer la modification"
        enCours={operation.enCours === "modifier"}
        erreur={fenetre === "modifier" ? erreurFenetre : null}
        onSubmit={async (donnees) => {
          const vitesseKmh = nombreSaisi(donnees, "vitesse")
          if (vitesseKmh !== undefined && Number.isNaN(vitesseKmh)) {
            operation.signaler({ ton: "danger", titre: "Action refusée", detail: "La vitesse doit être un nombre." })
            return
          }
          const dateFin = texte(donnees, "finPrevue")
          const nouvelleFin = dateFin && dateFin !== champDate(ltv.finPrevueLe) ? finJour(dateFin) : undefined
          const nouvelleVitesse = vitesseKmh !== undefined && vitesseKmh !== ltv.vitesseKmh ? vitesseKmh : undefined
          const ok = await operation.executer(
            "modifier",
            () => modifier({ ltvId: ltv.id as never, vitesseKmh: nouvelleVitesse, finPrevueLe: nouvelleFin, motif: String(donnees.get("motif") ?? "") }),
            "LTV modifiée."
          )
          if (ok) setFenetre(null)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vitesse limitée (km/h)" htmlFor="ltv-modif-vitesse" hint={`Actuellement ${kmh(ltv.vitesseKmh)} ; inférieure à ${kmh(ltv.vitesseNominaleKmh)}.`}>
            <Input id="ltv-modif-vitesse" name="vitesse" inputMode="numeric" className="tabular" defaultValue={String(ltv.vitesseKmh)} />
          </Field>
          <Field label="Fin prévue" htmlFor="ltv-modif-fin" hint={ltv.finPrevueLe ? `Actuellement ${dateHeure(ltv.finPrevueLe)}.` : "Aucune fin prévue à ce jour."}>
            <Input id="ltv-modif-fin" name="finPrevue" type="date" min={aujourdhuiService()} className="tabular" defaultValue={champDate(ltv.finPrevueLe)} />
          </Field>
        </div>
        <Field label="Motif de la modification" htmlFor="ltv-modif-motif">
          <Textarea id="ltv-modif-motif" name="motif" required minLength={5} maxLength={500} placeholder="Bourrage réalisé : relèvement à 60 km/h en attendant la stabilisation." />
        </Field>
      </FenetreFormulaire>

      <FenetreFormulaire
        open={fenetre === "lever"}
        onOpenChange={(o) => !o && setFenetre(null)}
        titre={`Lever la LTV ${ltv.numero}`}
        description={`Les trains reprennent ${kmh(ltv.vitesseNominaleKmh)} sur ${plagePk(ltv.pkDebut, ltv.pkFin)} dès l'enregistrement. Confirmez que la voie est rendue.`}
        libelleValider="Confirmer la levée"
        enCours={operation.enCours === "lever"}
        erreur={fenetre === "lever" ? erreurFenetre : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer("lever", () => lever({ ltvId: ltv.id as never, motif: String(donnees.get("motif") ?? "") }), `LTV ${ltv.numero} levée.`)
          if (ok) setFenetre(null)
        }}
      >
        {dossier.anomalie && dossier.anomalie.ouverte ? (
          <InlineMessage tone="warning" title={`L'anomalie ${dossier.anomalie.numero} est encore ouverte.`}>
            Vérifiez que le défaut ne menace plus la circulation avant de lever la limitation.
          </InlineMessage>
        ) : null}
        <Field label="Motif de la levée" htmlFor="ltv-motif-levee">
          <Textarea id="ltv-motif-levee" name="motif" required minLength={5} maxLength={500} placeholder="Voie contrôlée après bourrage, géométrie conforme." />
        </Field>
      </FenetreFormulaire>
    </CadreInfra>
  )
}
