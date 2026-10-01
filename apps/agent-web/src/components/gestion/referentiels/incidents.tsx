"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowRight, FileText, Plus, TriangleAlert } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { CATEGORIES_INCIDENT, DialogueDeclaration, FicheIncident, chronologieIncident, useActionsIncident } from "@/components/incident-detail"
import { FichePv, MOTIFS_PV, chronologiePv, useActionsPv } from "@/components/penalty-detail"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { Onglets, RetourOperation, SelectFiltre } from "./elements"
import { dateHeure, dateServiceCourte, montant } from "./format"
import { ETATS_INCIDENT, ETATS_PV, GRAVITES, TagGravite, TagIncident, TagPv } from "./statuts"

type Incident = FunctionReturnType<typeof api.functions.referentiels.incidents>[number]
type Pv = FunctionReturnType<typeof api.functions.control.listPenalties>[number]

const lieu = (i: Incident) => {
  const train = i.train ? `${i.train.trainNumber} · ${dateServiceCourte(i.train.serviceDate)}` : null
  const endroit = i.location ?? i.station?.name ?? null
  return [train, endroit].filter(Boolean).join(" · ") || "Réseau"
}

const colonnesIncidents: ColonneTableau<Incident>[] = [
  { cle: "ref", libelle: "Réf.", rendu: (i) => <span className="tabular font-semibold">{i.reference}</span>, tri: (i) => i.reference },
  { cle: "nature", libelle: "Nature", rendu: (i) => <CelluleDouble haut={i.description.length > 60 ? `${i.description.slice(0, 58)}…` : i.description} bas={CATEGORIES_INCIDENT[i.category]} />, tri: (i) => i.category, export: (i) => `${CATEGORIES_INCIDENT[i.category]} — ${i.description}` },
  { cle: "lieu", libelle: "Train · lieu", rendu: lieu, tri: lieu, secondaire: true },
  { cle: "signale", libelle: "Signalé", rendu: (i) => <span className="tabular">{dateHeure(i.reportedAt)}</span>, tri: (i) => i.reportedAt },
  { cle: "gravite", libelle: "Gravité", rendu: (i) => <TagGravite severity={i.severity} />, tri: (i) => ["critique", "important", "information"].indexOf(i.severity), export: (i) => GRAVITES[i.severity].libelle, secondaire: true },
  { cle: "etat", libelle: "État", rendu: (i) => <TagIncident status={i.status} />, tri: (i) => ["ouvert", "en_cours", "resolu"].indexOf(i.status), export: (i) => ETATS_INCIDENT[i.status].libelle },
]

const colonnesPv: ColonneTableau<Pv>[] = [
  { cle: "ref", libelle: "Réf.", rendu: (p) => <span className="tabular font-semibold">{p.penalty.number}</span>, tri: (p) => p.penalty.number },
  { cle: "motif", libelle: "Motif", rendu: (p) => MOTIFS_PV[p.penalty.reason], tri: (p) => p.penalty.reason, export: (p) => MOTIFS_PV[p.penalty.reason] },
  { cle: "train", libelle: "Train", rendu: (p) => (p.trip ? `${p.trip.trainNumber} · ${dateServiceCourte(p.trip.serviceDate)}` : "—"), tri: (p) => p.trip?.trainNumber, secondaire: true },
  { cle: "emis", libelle: "Émis", rendu: (p) => <span className="tabular">{dateHeure(p.penalty.issuedAt)}</span>, tri: (p) => p.penalty.issuedAt },
  { cle: "montant", libelle: "Montant", rendu: (p) => montant(p.penalty.amountXaf), tri: (p) => p.penalty.amountXaf, numerique: true },
  { cle: "etat", libelle: "État", rendu: (p) => <TagPv status={p.penalty.status} />, tri: (p) => ["emis", "conteste", "paye", "annule"].indexOf(p.penalty.status), export: (p) => ETATS_PV[p.penalty.status].libelle },
]

function ApercuIncident({ id }: { id: string }) {
  const dossier = useQuery(api.functions.referentiels.incident, { incidentId: id as never })
  const actions = useActionsIncident(dossier)
  if (dossier === undefined) return <SkeletonLines />
  if (dossier === null) return <InlineMessage tone="warning" title="Ce signalement n'existe plus." />
  return (
    <Panneau
      titre={dossier.reference}
      icone={TriangleAlert}
      sousTitre={CATEGORIES_INCIDENT[dossier.incident.category]}
      actions={
        <LienBouton href={`/gestion/incidents/${dossier.incident._id}`} variante="ghost" taille="sm">
          Dossier
          <ArrowRight />
        </LienBouton>
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagIncident status={dossier.incident.status} />
        {actions.boutons}
      </div>
      <RetourOperation retour={actions.operation.retour} />
      <p className="text-[14px]">{dossier.incident.description}</p>
      <FicheIncident dossier={dossier} />
      <Chronologie evenements={chronologieIncident(dossier)} />
      {actions.formulaireCloture}
      {actions.dialogue}
    </Panneau>
  )
}

function ApercuPv({ id }: { id: string }) {
  const dossier = useQuery(api.functions.referentiels.penalite, { penaltyId: id as never })
  const actions = useActionsPv(dossier)
  if (dossier === undefined) return <SkeletonLines />
  if (dossier === null) return <InlineMessage tone="warning" title="Ce procès-verbal n'existe plus." />
  const boutons = actions.boutons()
  return (
    <Panneau
      titre={dossier.penalty.number}
      icone={FileText}
      sousTitre={MOTIFS_PV[dossier.penalty.reason]}
      actions={
        <LienBouton href={`/gestion/incidents/proces-verbaux/${dossier.penalty._id}`} variante="ghost" taille="sm">
          Dossier
          <ArrowRight />
        </LienBouton>
      }
      pied={boutons ? <div className="ml-auto flex flex-wrap gap-2">{boutons}</div> : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <TagPv status={dossier.penalty.status} />
      </div>
      <RetourOperation retour={actions.operation.retour} />
      <FichePv dossier={dossier} />
      <Chronologie evenements={chronologiePv(dossier)} />
      {actions.fenetre}
    </Panneau>
  )
}

export function IncidentsPv() {
  const router = useRouter()
  const parametres = useSearchParams()
  const droits = useDroitsGestion()
  const peutIncidents = droits.may("incidents")
  const peutPv = droits.may("proces_verbaux")
  const [onglet, setOnglet] = useState<"incidents" | "pv">(parametres.get("onglet") === "pv" || !peutIncidents ? "pv" : "incidents")
  const [etat, setEtat] = useState("tous")
  const [selection, setSelection] = useState<string | null>(null)
  const [declaration, setDeclaration] = useState(false)
  const incidents = useQuery(api.functions.referentiels.incidents, peutIncidents ? {} : "skip")
  const pvs = useQuery(api.functions.control.listPenalties, peutPv ? {} : "skip")

  const incidentsFiltres = incidents?.filter((i) => etat === "tous" || i.status === etat || (etat === "ouverts" && i.status !== "resolu"))
  const pvFiltres = pvs?.filter((p) => etat === "tous" || p.penalty.status === etat || (etat === "ouverts" && (p.penalty.status === "emis" || p.penalty.status === "conteste")))
  const courantIncident = selection ?? incidentsFiltres?.find((i) => i.status !== "resolu")?._id ?? incidentsFiltres?.[0]?._id
  const courantPv = selection ?? pvFiltres?.find((p) => p.penalty.status === "emis")?.penalty._id ?? pvFiltres?.[0]?.penalty._id

  return (
    <CadreGestion
      surtitre="Supervision · remontées du terrain"
      titre="Incidents et procès-verbaux"
      description="Ce que les contrôleurs et les gares signalent. Un procès-verbal non payé à bord s'encaisse au guichet ; un incident se clôt avec une cause."
      lectureSeule={!droits.chargement && !droits.may("incidents", "modifier") && !droits.may("proces_verbaux", "modifier") ? mentionLectureSeule(droits.role, "les remontées du terrain") : undefined}
      actions={
        droits.may("incidents", "creer") ? (
          <Button type="button" variant="secondary" onClick={() => setDeclaration(true)}>
            <Plus />
            Déclarer un incident
          </Button>
        ) : null
      }
    >
      <Onglets
        libelle="Registre"
        valeur={onglet}
        onChange={(cle) => {
          setOnglet(cle)
          setSelection(null)
          setEtat("tous")
        }}
        onglets={[
          ...(peutIncidents ? [{ cle: "incidents" as const, libelle: "Incidents", compte: incidents?.filter((i) => i.status !== "resolu").length }] : []),
          ...(peutPv ? [{ cle: "pv" as const, libelle: "Procès-verbaux", compte: pvs?.filter((p) => p.penalty.status === "emis").length }] : []),
        ]}
      />
      <div role="tabpanel" className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        {onglet === "incidents" ? (
          <>
            <TableauDonnees
              libelle="Incidents"
              colonnes={colonnesIncidents}
              lignes={incidentsFiltres}
              cle={(i) => i._id}
              selection={courantIncident}
              surLigne={(i) => setSelection(i._id)}
              recherche={{ placeholder: "Réf., nature, train, lieu…", texte: (i) => `${i.reference} ${i.description} ${lieu(i)} ${i.declarant?.nom ?? ""}` }}
              filtres={
                <SelectFiltre libelle="État" value={etat} onChange={setEtat}>
                  <option value="tous">Tous les états</option>
                  <option value="ouverts">Non clos</option>
                  {Object.entries(ETATS_INCIDENT).map(([cle, def]) => (
                    <option key={cle} value={cle}>
                      {def.libelle}
                    </option>
                  ))}
                </SelectFiltre>
              }
              exportNom="incidents"
              triInitial={{ cle: "signale", sens: "desc" }}
              vide={{ titre: "Aucun incident", description: "Rien n'a été signalé sur le réseau." }}
            />
            <div className="grid content-start gap-4">{courantIncident ? <ApercuIncident key={courantIncident} id={courantIncident} /> : null}</div>
          </>
        ) : (
          <>
            <TableauDonnees
              libelle="Procès-verbaux"
              colonnes={colonnesPv}
              lignes={pvFiltres}
              cle={(p) => p.penalty._id}
              selection={courantPv}
              surLigne={(p) => setSelection(p.penalty._id)}
              recherche={{ placeholder: "Réf., train…", texte: (p) => `${p.penalty.number} ${p.trip?.trainNumber ?? ""} ${MOTIFS_PV[p.penalty.reason]}` }}
              filtres={
                <SelectFiltre libelle="État" value={etat} onChange={setEtat}>
                  <option value="tous">Tous les états</option>
                  <option value="ouverts">À traiter</option>
                  {Object.entries(ETATS_PV).map(([cle, def]) => (
                    <option key={cle} value={cle}>
                      {def.libelle}
                    </option>
                  ))}
                </SelectFiltre>
              }
              exportNom="proces-verbaux"
              triInitial={{ cle: "emis", sens: "desc" }}
              vide={{ titre: "Aucun procès-verbal", description: "Aucune irrégularité n'a été verbalisée." }}
            />
            <div className="grid content-start gap-4">{courantPv ? <ApercuPv key={courantPv} id={courantPv} /> : null}</div>
          </>
        )}
      </div>
      <DialogueDeclaration open={declaration} onOpenChange={setDeclaration} onDeclare={(id) => router.push(`/gestion/incidents/${id}`)} />
    </CadreGestion>
  )
}
