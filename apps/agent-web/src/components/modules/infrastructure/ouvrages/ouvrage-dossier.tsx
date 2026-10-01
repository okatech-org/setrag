"use client"

import { BrickWall, ClipboardList, PencilLine, Plus, ShieldAlert, TrendingDown } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"

import { CadreInfra, DossierEnChargement, DossierIntrouvable, TagCotation, TagEtat, TagRetard, infraApi, pk, useDroitsInfra, type DossierOuvrage } from "../commun"
import { AnomaliesLiees, PanneauChronologie, dateEtHeure } from "../interventions/partage"
import { FenetreInspection, FenetreOuvrage } from "./formulaires"
import { libelleTypeInspection } from "./libelles"
import { TagSurveillance } from "./ouvrages"

type InspectionResume = DossierOuvrage["inspections"][number]

const RETOUR = { href: "/infrastructures/ouvrages", libelle: "Ouvrages d'art" }

const colonnesInspections: ColonneTableau<InspectionResume>[] = [
  { cle: "numero", libelle: "N°", rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>, tri: (i) => i.numero },
  { cle: "date", libelle: "Date", rendu: (i) => <span className="tabular">{dateCourte(i.dateInspection)}</span>, tri: (i) => i.dateInspection, export: (i) => dateCourte(i.dateInspection) },
  { cle: "type", libelle: "Type", rendu: (i) => libelleTypeInspection(i.type), tri: (i) => libelleTypeInspection(i.type) },
  { cle: "inspecteur", libelle: "Inspecteur", rendu: (i) => i.inspecteurNom, tri: (i) => i.inspecteurNom, secondaire: true },
  {
    cle: "cotation",
    libelle: "Cotation avant → proposée",
    rendu: (i) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <TagCotation cotation={i.cotationAvant} />
        <span aria-hidden>→</span>
        <span className="sr-only">proposée</span>
        <TagCotation cotation={i.cotationProposee} />
      </span>
    ),
    tri: (i) => i.cotationProposee,
    export: (i) => `${i.cotationAvant} → ${i.cotationProposee}`,
  },
  { cle: "desordres", libelle: "Désordres", rendu: (i) => <span className="tabular">{i.nbDesordres}</span>, tri: (i) => i.nbDesordres, numerique: true, secondaire: true },
  { cle: "statut", libelle: "Statut", rendu: (i) => <TagEtat valeur={i.statut} libelle={i.statutLibelle} />, tri: (i) => i.statut, export: (i) => i.statutLibelle },
  {
    cle: "valide",
    libelle: "Validée par",
    rendu: (i) => (i.valideParNom ? `${i.valideParNom} · ${dateCourte(i.valideLe)}` : "—"),
    tri: (i) => i.valideLe,
    export: (i) => (i.valideParNom ? `${i.valideParNom} (${dateCourte(i.valideLe)})` : ""),
    secondaire: true,
  },
]

export function OuvrageDossier({ ouvrageId }: { ouvrageId: string }) {
  const router = useRouter()
  const droits = useDroitsInfra()
  const dossier = useQuery(infraApi.queries.ouvrage, { ouvrageId: ouvrageId as DossierOuvrage["ouvrage"]["id"] })
  const operation = useOperation()
  const [mode, setMode] = useState<"modifier" | "inspection" | null>(null)
  const [cleFenetre, setCleFenetre] = useState(0)

  if (dossier === undefined) {
    return (
      <CadreInfra titre="Ouvrage d'art" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Ouvrage introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Ouvrage" retour={RETOUR} />
      </CadreInfra>
    )
  }

  const { ouvrage, inspections } = dossier
  const peutInspecter = droits.peut("ouvrage_inspecter")
  const ouvrir = (m: "modifier" | "inspection") => {
    setCleFenetre((c) => c + 1)
    setMode(m)
  }
  const validees = inspections.filter((i) => i.statut === "validee")
  const brouillons = inspections.filter((i) => i.statut === "brouillon").length

  return (
    <CadreInfra
      titre={`${ouvrage.code} · ${ouvrage.nom}`}
      description={`${ouvrage.typeLibelle} au ${pk(ouvrage.pk)}${ouvrage.sectionLibelle ? `, section ${ouvrage.sectionLibelle}` : ""}.`}
      retour={RETOUR}
      actions={
        peutInspecter ? (
          <>
            <Button type="button" variant="secondary" onClick={() => ouvrir("modifier")}>
              <PencilLine />
              Modifier la fiche
            </Button>
            <Button type="button" onClick={() => ouvrir("inspection")}>
              <Plus />
              Nouvelle inspection
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagCotation cotation={ouvrage.cotation} libelle={ouvrage.cotationLibelle.replace(/^\S+\s—\s/, "")} />
        {ouvrage.surveillanceRenforcee ? <TagSurveillance /> : null}
        {ouvrage.inspectionEnRetard ? <TagRetard texte="Inspection en retard" /> : null}
        {brouillons > 0 ? <TagEtat valeur="brouillon" libelle={`${brouillons} inspection${brouillons > 1 ? "s" : ""} à valider`} /> : null}
      </div>
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche de l'ouvrage" icone={BrickWall}>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{ouvrage.code}</span>],
                ["Type", ouvrage.typeLibelle],
                ["Point kilométrique", <span key="p" className="tabular">{pk(ouvrage.pk)}</span>],
                ["Section", ouvrage.sectionLibelle ?? "Hors section"],
                ["Longueur", <span key="l" className="tabular">{nombre(ouvrage.longueurM)} m</span>],
                ["Matériau", ouvrage.materiau],
                ["Année de construction", <span key="a" className="tabular">{ouvrage.anneeConstruction}</span>],
                ["Franchissement", ouvrage.franchissement ?? "—"],
                ["Anomalies ouvertes", <span key="o" className="tabular">{ouvrage.anomaliesOuvertes}</span>],
                ["Fiche mise à jour", <span key="m" className="tabular">{dateEtHeure(ouvrage.majLe)}</span>],
              ]}
            />
          </Panneau>
          <Panneau titre="Inspections" icone={ClipboardList} sousTitre={`${inspections.length} au registre, ${brouillons} en brouillon`}>
            <TableauDonnees
              libelle={`Inspections de ${ouvrage.code}`}
              colonnes={colonnesInspections}
              lignes={inspections}
              cle={(i) => i.id}
              lien={(i) => `/infrastructures/ouvrages/inspections/${i.id}`}
              exportNom={`inspections-${ouvrage.code}`}
              triInitial={{ cle: "date", sens: "desc" }}
              parPage={10}
              vide={{
                titre: "Aucune inspection enregistrée",
                description: "La première inspection fixe la cotation IQOA de l'ouvrage.",
                action: peutInspecter ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir("inspection")}>
                    <Plus />
                    Rédiger l&apos;inspection
                  </Button>
                ) : undefined,
              }}
            />
          </Panneau>
          <AnomaliesLiees anomalies={dossier.anomalies} exportNom={`anomalies-${ouvrage.code}`} vide="Aucune anomalie terrain n'a été rattachée à cet ouvrage." />
        </div>

        <div className="grid content-start gap-5">
          <Panneau titre="Cotation IQOA" icone={ShieldAlert}>
            <p className="text-[15px] font-semibold">{ouvrage.cotationLibelle}</p>
            <Fiche
              elements={[
                ["Surveillance", ouvrage.surveillanceRenforcee ? "Renforcée" : "Courante"],
                ["Périodicité d'inspection", <span key="p" className="tabular">{ouvrage.periodiciteMois} mois</span>],
                ["Dernière inspection", <span key="d" className="tabular">{dateCourte(ouvrage.derniereInspectionLe)}</span>],
                [
                  "Prochaine inspection",
                  <span key="n" className="tabular">
                    {dateCourte(ouvrage.prochaineInspectionLe)}
                    {ouvrage.inspectionEnRetard ? " (dépassée)" : ""}
                  </span>,
                ],
              ]}
            />
          </Panneau>
          <Panneau titre="Historique de cotation" icone={TrendingDown} sousTitre="Inspections validées">
            {validees.length === 0 ? (
              <p className="text-small text-ink-muted">Aucune inspection validée : la cotation actuelle est la cotation initiale.</p>
            ) : (
              <ol className="grid gap-2">
                {validees.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-[14px] last:border-b-0 last:pb-0">
                    <span className="tabular w-24 text-ink-muted">{dateCourte(i.dateInspection)}</span>
                    <TagCotation cotation={i.cotationAvant} />
                    <span aria-hidden>→</span>
                    <span className="sr-only">devient</span>
                    <TagCotation cotation={i.cotationProposee} />
                    <span className="tabular text-[13px] text-ink-muted">{i.numero}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panneau>
          <PanneauChronologie evenements={dossier.chronologie} />
        </div>
      </div>

      {peutInspecter ? (
        <>
          <FenetreOuvrage key={`o-${cleFenetre}`} open={mode === "modifier"} onOpenChange={(o) => !o && setMode(null)} operation={operation} ouvrage={ouvrage} />
          <FenetreInspection
            key={`i-${cleFenetre}`}
            open={mode === "inspection"}
            onOpenChange={(o) => !o && setMode(null)}
            operation={operation}
            ouvrage={{ id: ouvrage.id, code: ouvrage.code, nom: ouvrage.nom, cotation: ouvrage.cotation }}
            onCree={(id) => router.push(`/infrastructures/ouvrages/inspections/${id}` as Route)}
          />
        </>
      ) : null}
    </CadreInfra>
  )
}
