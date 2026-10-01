"use client"

import type { FunctionReturnType } from "convex/server"
import { Trash2 } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed } from "./cadre"
import { CLASSIFICATIONS, DIRECTIONS } from "./statuts"

type Plan = FunctionReturnType<typeof api.modules.ged.queries.planClassement>
type Serie = Plan["series"][number]
type Echue = Plan["echues"][number]

const SORTS = { destruction: "Destruction", conservation_definitive: "Conservation définitive", tri: "Tri" } as const
const jour = (date: string | null) => (date ? dateCourte(Date.parse(`${date}T12:00:00Z`)) : "—")

const colonnesSeries: ColonneTableau<Serie>[] = [
  { cle: "code", libelle: "Série", rendu: (s) => <CelluleDouble mono haut={s.code} bas={s.processus} />, tri: (s) => s.code },
  { cle: "libelle", libelle: "Libellé", rendu: (s) => <CelluleDouble haut={s.libelle} bas={s.description} />, tri: (s) => s.libelle, export: (s) => s.libelle },
  { cle: "direction", libelle: "Direction", rendu: (s) => s.directionLibelle, tri: (s) => s.direction, secondaire: true },
  {
    cle: "duree",
    libelle: "Conservation",
    rendu: (s) => (
      <CelluleDouble
        haut={s.conservationAnnees === null ? "Définitive" : `${s.conservationAnnees} ans`}
        bas={s.aValider ? "À confirmer par la Direction juridique" : "Base légale identifiée"}
      />
    ),
    tri: (s) => s.conservationAnnees ?? 999,
    export: (s) => (s.conservationAnnees === null ? "définitive" : s.conservationAnnees),
  },
  { cle: "base", libelle: "Base", rendu: (s) => <small className="text-[12.5px] text-ink-muted">{s.baseConservation}</small>, tri: (s) => s.baseConservation, secondaire: true },
  { cle: "sort", libelle: "Sort final", rendu: (s) => SORTS[s.sortFinal], tri: (s) => s.sortFinal, export: (s) => SORTS[s.sortFinal], secondaire: true },
  {
    cle: "acces",
    libelle: "Accès par défaut",
    rendu: (s) => CLASSIFICATIONS[s.classificationParDefaut].libelle,
    tri: (s) => s.classificationParDefaut,
    secondaire: true,
  },
  { cle: "total", libelle: "Pièces", rendu: (s) => s.total, tri: (s) => s.total, numerique: true },
  { cle: "archives", libelle: "Archivées", rendu: (s) => s.archives, tri: (s) => s.archives, numerique: true, secondaire: true },
  {
    cle: "echues",
    libelle: "Échues",
    rendu: (s) => <span className={s.echues > 0 ? "font-semibold text-warning-ink" : undefined}>{s.echues}</span>,
    tri: (s) => s.echues,
    numerique: true,
  },
]

const colonnesEchues: ColonneTableau<Echue>[] = [
  { cle: "reference", libelle: "Référence", rendu: (e) => <span className="tabular font-semibold">{e.reference}</span>, tri: (e) => e.reference },
  { cle: "titre", libelle: "Pièce", rendu: (e) => e.titre, tri: (e) => e.titre },
  { cle: "fin", libelle: "Conservation échue le", rendu: (e) => <span className="tabular">{jour(e.conservationJusquau)}</span>, tri: (e) => e.conservationJusquau ?? "" },
  { cle: "archive", libelle: "Archivée le", rendu: (e) => <span className="tabular">{dateHeure(e.archiveLe)}</span>, tri: (e) => e.archiveLe ?? 0, secondaire: true },
]

/** Plan de classement, durées de conservation et pièces en fin de conservation. */
export function PlanClassement() {
  const plan = useQuery(api.modules.ged.queries.planClassement, {})
  const [direction, setDirection] = useState("toutes")
  const series = plan?.series.filter((serie) => direction === "toutes" || serie.direction === direction)
  const aValider = plan?.series.filter((serie) => serie.aValider).length ?? 0

  return (
    <CadreGed
      titre="Classement et archives"
      description="Le plan de classement par direction et processus, la durée de conservation de chaque série et sa base. Les pièces dont la durée est échue peuvent être éliminées par un gestionnaire habilité."
    >
      {plan ? (
        <Indicateurs colonnes={4}>
          <Indicateur libelle="Séries" valeur={plan.series.length} />
          <Indicateur libelle="Pièces classées" valeur={plan.series.reduce((total, serie) => total + serie.total, 0)} />
          <Indicateur libelle="Archivées" valeur={plan.series.reduce((total, serie) => total + serie.archives, 0)} />
          <Indicateur
            libelle="Durées à confirmer"
            valeur={aValider}
            evolution={{ sens: aValider > 0 ? "vigilance" : "neutre", texte: "Sans texte légal identifié" }}
          />
        </Indicateurs>
      ) : null}
      {aValider > 0 ? (
        <InlineMessage tone="info" title="Durées à valider.">
          Seules les pièces comptables reposent sur un texte précis (AUDCIF OHADA, article 24 : dix ans). Les autres durées
          suivent une politique interne que la Direction juridique doit confirmer.
        </InlineMessage>
      ) : null}
      <TableauDonnees
        libelle="Plan de classement"
        colonnes={colonnesSeries}
        lignes={series}
        cle={(serie) => serie._id}
        lien={(serie) => `/bureautique/documents?serie=${serie.code}`}
        recherche={{ placeholder: "Code, libellé, processus…", texte: (serie) => `${serie.code} ${serie.libelle} ${serie.processus} ${serie.description}` }}
        filtres={
          <SelectFiltre libelle="Direction" value={direction} onChange={setDirection}>
            <option value="toutes">Toutes les directions</option>
            {Object.entries(DIRECTIONS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectFiltre>
        }
        exportNom="plan-de-classement"
        imprimable
        triInitial={{ cle: "code", sens: "asc" }}
        vide={{ titre: "Plan de classement vide", description: "Le plan n'a pas encore été chargé." }}
      />
      {plan?.gestionnaire ? (
        <Panneau titre="Fin de conservation" icone={Trash2} sousTitre="Pièces archivées dont la durée légale est échue">
          <TableauDonnees
            libelle="Pièces en fin de conservation"
            colonnes={colonnesEchues}
            lignes={plan.echues}
            cle={(echue) => echue._id}
            lien={(echue) => `/bureautique/documents/${echue._id}`}
            exportNom="ged-fin-de-conservation"
            vide={{ titre: "Aucune pièce échue", description: "Aucune pièce archivée n'a dépassé sa durée de conservation." }}
          />
          {!plan.peutEliminer ? (
            <p className="text-small text-ink-muted">L’élimination exige le droit de suppression GED : vous pouvez seulement préparer la liste.</p>
          ) : null}
        </Panneau>
      ) : null}
    </CadreGed>
  )
}
