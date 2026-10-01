"use client"

import { CalendarClock, Download, FileClock } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"

import { CelluleDouble, EnTetePage, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"

import { CadrePilotage, messageLectureSeule, usePilotage } from "./cadre"
import { ListeEtDossier } from "./elements"
import { horodatage, jourNumerique, nombre } from "./format"
import {
  DialogueGeneration,
  DialogueProgrammation,
  DossierExecution,
  LIBELLE_FORMAT,
  LIBELLE_FREQUENCE,
  LIBELLE_PROGRAMMATION,
  RAPPORTS,
  TYPES_RAPPORT,
  TagExecution,
  libelleDeclencheur,
  type RunId,
  type TypeRapport,
} from "./rapports-communs"
import { useSelectionUrl } from "./url"

type Programmation = FunctionReturnType<typeof api.functions.reportSchedules.list>[number]
type Execution = FunctionReturnType<typeof api.functions.pilotage.executionsRapport>[number]

export function Rapports() {
  const pilotage = usePilotage()
  const [selection, choisir] = useSelectionUrl(["execution"] as const)
  const [aGenerer, setAGenerer] = useState<TypeRapport | null>(null)
  const [aProgrammer, setAProgrammer] = useState<TypeRapport | null>(null)
  const voit = pilotage.voit("rapports")
  const programmations = useQuery(api.functions.reportSchedules.list, voit ? {} : "skip")
  const executions = useQuery(api.functions.pilotage.executionsRapport, voit ? { limit: 100 } : "skip")

  const peutCreer = pilotage.peut("rapports", "creer")
  const permis = (type: TypeRapport) =>
    peutCreer &&
    (!RAPPORTS[type].nominatif || pilotage.voit("donnees_voyageurs")) &&
    (type !== "tracabilite_places" || pilotage.voit("places"))
  const lectureSeule = pilotage.pret && pilotage.enLigne && !peutCreer ? messageLectureSeule(pilotage.role, "les rapports") : false

  const colonnesProgrammations: ColonneTableau<Programmation>[] = [
    {
      cle: "rapport",
      libelle: "Rapport",
      rendu: (p) => <CelluleDouble haut={p.label} bas={LIBELLE_PROGRAMMATION[p.reportType]} />,
      tri: (p) => p.label,
    },
    { cle: "frequence", libelle: "Fréquence", rendu: (p) => LIBELLE_FREQUENCE[p.frequency] ?? p.frequency, tri: (p) => p.frequency },
    { cle: "format", libelle: "Format", secondaire: true, rendu: (p) => LIBELLE_FORMAT[p.format] ?? p.format, tri: (p) => p.format },
    {
      cle: "destinataires",
      libelle: "Destinataires",
      secondaire: true,
      rendu: (p) => (p.recipients.length > 1 ? `${p.recipients[0]} +${p.recipients.length - 1}` : p.recipients[0]),
      tri: (p) => p.recipients.join(", "),
    },
    { cle: "dernier", libelle: "Dernier envoi", rendu: (p) => <span className="tabular text-[13px]">{horodatage(p.lastRunAt)}</span>, tri: (p) => p.lastRunAt ?? null },
    { cle: "prochain", libelle: "Prochain", secondaire: true, rendu: (p) => <span className="tabular text-[13px]">{p.isActive ? horodatage(p.nextRunAt) : "—"}</span>, tri: (p) => p.nextRunAt },
    {
      cle: "etat",
      libelle: "État",
      rendu: (p) => (p.isActive ? <Tag tone="success">Active</Tag> : <Tag tone="neutral">Suspendue</Tag>),
      tri: (p) => (p.isActive ? 0 : 1),
      export: (p) => (p.isActive ? "Active" : "Suspendue"),
    },
  ]

  const colonnesExecutions: ColonneTableau<Execution>[] = [
    {
      cle: "etat",
      libelle: "État",
      rendu: (e) => <TagExecution statut={e.status} />,
      tri: (e) => e.status,
      export: (e) => (e.status === "produit" ? "Produit" : e.status === "echec" ? "En échec" : "En production"),
    },
    {
      cle: "rapport",
      libelle: "État demandé",
      rendu: (e) => <CelluleDouble haut={RAPPORTS[e.reportType].titre} bas={`${jourNumerique(e.from)} → ${jourNumerique(e.to)}${e.filters.trainNumber ? ` · ${e.filters.trainNumber}` : ""}${e.filters.pointOfSale ? ` · ${e.filters.pointOfSale.split(" · ")[0]}` : ""}`} />,
      tri: (e) => RAPPORTS[e.reportType].titre,
      export: (e) => `${RAPPORTS[e.reportType].titre} ${e.from} → ${e.to}`,
    },
    { cle: "lignes", libelle: "Lignes", numerique: true, rendu: (e) => nombre(e.rowCount), tri: (e) => e.rowCount },
    { cle: "par", libelle: "Demandé par", secondaire: true, rendu: (e) => <CelluleDouble haut={e.requestedBy} bas={libelleDeclencheur(e.trigger)} />, tri: (e) => e.requestedBy },
    { cle: "le", libelle: "Le", rendu: (e) => <span className="tabular text-[13px]">{horodatage(e.requestedAt)}</span>, tri: (e) => e.requestedAt },
  ]

  return (
    <CadrePilotage lectureSeule={lectureSeule}>
      <EnTetePage
        surtitre="Finances · reporting"
        titre="Rapports"
        description="Les six états du cahier des charges, à la demande ou programmés. Même filtre partout : période, point de vente, train, produit. Chaque fichier produit reste téléchargeable depuis l’historique."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {TYPES_RAPPORT.map((type) => {
          const info = RAPPORTS[type]
          const Icone = info.icone
          const autorise = permis(type)
          return (
            <section key={type} aria-labelledby={`rapport-${type}`} className="grid content-start gap-2 rounded-md border border-line bg-surface p-4">
              <h2 id={`rapport-${type}`} className="flex items-center gap-2 text-[16px] font-bold">
                <Icone aria-hidden className="size-[18px] text-ink-muted" />
                {info.titre}
                {info.nominatif ? <Tag tone="second" className="ml-auto">Nominatif</Tag> : null}
              </h2>
              <p className="text-small text-ink-muted">{info.description}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!autorise} onClick={() => setAGenerer(type)}>
                  <Download />
                  Générer
                </Button>
                <Button type="button" variant="ghost" disabled={!autorise} onClick={() => setAProgrammer(type)}>
                  <CalendarClock />
                  Programmer
                </Button>
              </div>
              {!autorise && pilotage.pret && pilotage.enLigne ? (
                <small className="text-[12.5px] text-ink-muted">
                  {info.nominatif && !pilotage.voit("donnees_voyageurs")
                    ? "Réservé aux rôles qui lisent les données voyageurs."
                    : "Votre rôle ne permet pas de produire cet état."}
                </small>
              ) : null}
            </section>
          )
        })}
      </div>

      <ListeEtDossier
        liste={
          <>
            <Panneau titre="Historique des exécutions" icone={FileClock} sousTitre="à la demande et programmées">
              {executions === undefined ? (
                <SkeletonLines />
              ) : (
                <TableauDonnees
                  colonnes={colonnesExecutions}
                  lignes={executions}
                  cle={(e) => e._id}
                  libelle="Historique des exécutions de rapports"
                  surLigne={(e) => choisir({ execution: e._id === selection.execution ? undefined : e._id })}
                  selection={selection.execution ?? ""}
                  recherche={{ placeholder: "État, demandeur, train", texte: (e) => `${RAPPORTS[e.reportType].titre} ${e.requestedBy} ${e.filters.trainNumber ?? ""} ${e.filters.pointOfSale ?? ""}` }}
                  exportNom="setrag-executions-rapports"
                  parPage={10}
                  triInitial={{ cle: "le", sens: "desc" }}
                  vide={{ titre: "Aucun état produit pour l’instant", description: "Générez un des six états ci-dessus : il apparaîtra ici avec son fichier." }}
                />
              )}
            </Panneau>
            <Panneau titre="Rapports programmés" icone={CalendarClock}>
              <TableauDonnees
                colonnes={colonnesProgrammations}
                lignes={programmations}
                cle={(p) => p._id}
                libelle="Rapports programmés"
                lien={(p) => `/gestion/rapports/${p._id}`}
                exportNom="setrag-rapports-programmes"
                parPage={10}
                vide={{ titre: "Aucun envoi programmé", description: "Programmez un état depuis sa carte : il partira à chaque échéance." }}
              />
            </Panneau>
          </>
        }
        dossier={
          selection.execution ? (
            <DossierExecution runId={selection.execution as RunId} surFermeture={() => choisir({ execution: undefined })} />
          ) : (
            <Panneau titre="Exécution" icone={FileClock}>
              <p className="text-small text-ink-muted">
                Choisissez une exécution dans l’historique pour voir ses filtres, un aperçu des lignes et télécharger le fichier.
              </p>
            </Panneau>
          )
        }
      />

      <DialogueGeneration
        type={aGenerer}
        surFermeture={() => setAGenerer(null)}
        surProduction={(runId) => {
          setAGenerer(null)
          choisir({ execution: runId })
        }}
      />
      <DialogueProgrammation type={aProgrammer} surFermeture={() => setAProgrammer(null)} />
    </CadrePilotage>
  )
}
