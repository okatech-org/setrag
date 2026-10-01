"use client"

import type { FunctionReturnType } from "convex/server"
import { Building2, Clock } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Tag } from "@workspace/ui/components/tag"

import {
  CelluleDouble,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { AccesRestreint, dateIso } from "@/components/modules/rh/commun"

import {
  Avancement,
  CadreSecurite,
  TagAction,
  TagRetard,
  useAccesSecurite,
} from "./cadre-securite"
import {
  DIRECTIONS_RESPONSABLES,
  PRIORITES,
  STATUTS_ACTION,
  type DirectionResponsable,
  type Priorite,
  type StatutAction,
} from "./libelles"

type LigneListe = FunctionReturnType<
  typeof api.modules.securite.actions.lister
>[number]

/** Ce qu'une ligne d'action doit porter pour s'afficher dans un plan. */
export interface LigneAction {
  _id: string
  numero: string
  libelle: string
  responsableNom: string
  responsableDirection: DirectionResponsable
  echeance: string
  priorite: Priorite
  statut: StatutAction
  avancement: number
  enRetard: boolean
}

const NATURES_SOURCE = {
  enquete: "Enquête",
  inspection: "Inspection",
  evenement: "Événement",
} as const

export function libelleSource(source: LigneListe["source"]) {
  return source ? `${NATURES_SOURCE[source.nature]} ${source.numero}` : "—"
}

/** Colonnes d'un plan d'actions ; `source` ajoute la colonne de rattachement. */
export function colonnesActions<T extends LigneAction>(
  source?: (ligne: T) => string
): ColonneTableau<T>[] {
  return [
    {
      cle: "numero",
      libelle: "N°",
      rendu: (a) => <span className="tabular font-semibold">{a.numero}</span>,
      tri: (a) => a.numero,
    },
    {
      cle: "libelle",
      libelle: "Action",
      rendu: (a) => a.libelle,
      tri: (a) => a.libelle,
    },
    ...(source
      ? [
          {
            cle: "source",
            libelle: "Source",
            rendu: source,
            tri: source,
            secondaire: true,
          },
        ]
      : []),
    {
      cle: "responsable",
      libelle: "Responsable",
      rendu: (a) => (
        <CelluleDouble
          haut={a.responsableNom}
          bas={`${a.responsableDirection} · ${DIRECTIONS_RESPONSABLES[a.responsableDirection]}`}
        />
      ),
      tri: (a) => a.responsableNom,
      export: (a) => `${a.responsableNom} (${a.responsableDirection})`,
      secondaire: true,
    },
    {
      cle: "echeance",
      libelle: "Échéance",
      rendu: (a) => (
        <span className="flex flex-wrap items-center gap-1">
          <span className="tabular whitespace-nowrap">
            {dateIso(a.echeance)}
          </span>
          {a.enRetard ? <TagRetard /> : null}
        </span>
      ),
      tri: (a) => a.echeance,
      export: (a) => `${a.echeance}${a.enRetard ? " (en retard)" : ""}`,
    },
    {
      cle: "priorite",
      libelle: "Priorité",
      rendu: (a) =>
        a.priorite === "haute" ? (
          <Tag tone="warning">Haute</Tag>
        ) : (
          <span className="text-ink-muted">Normale</span>
        ),
      tri: (a) => (a.priorite === "haute" ? 0 : 1),
      export: (a) => PRIORITES[a.priorite],
      secondaire: true,
    },
    {
      cle: "avancement",
      libelle: "Avancement",
      rendu: (a) => <Avancement valeur={a.avancement} />,
      tri: (a) => a.avancement,
      export: (a) => `${a.avancement} %`,
    },
    {
      cle: "statut",
      libelle: "Statut",
      rendu: (a) => <TagAction statut={a.statut} />,
      tri: (a) => a.statut,
      export: (a) => STATUTS_ACTION[a.statut],
    },
  ]
}

const colonnesListe = colonnesActions<LigneListe>((a) =>
  libelleSource(a.source)
)

/** Plan d'actions correctives, toutes sources confondues. */
export function ListeActions() {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const actions = useQuery(
    api.modules.securite.actions.lister,
    lecture ? {} : "skip"
  )
  const [statut, setStatut] = useState("ouvertes")
  const [direction, setDirection] = useState("toutes")
  const [retard, setRetard] = useState("tous")

  const filtres = actions?.filter(
    (a) =>
      (statut === "toutes" ||
        (statut === "ouvertes"
          ? a.statut === "planifiee" ||
            a.statut === "en_cours" ||
            a.statut === "realisee"
          : a.statut === statut)) &&
      (direction === "toutes" || a.responsableDirection === direction) &&
      (retard === "tous" || (retard === "retard" ? a.enRetard : !a.enRetard))
  )

  return (
    <CadreSecurite
      titre="Plan d'actions correctives"
      description="Actions issues des enquêtes, des inspections et des événements : responsable, échéance, preuve de réalisation et vérification d'efficacité."
    >
      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas le plan d&apos;actions correctives.
        </AccesRestreint>
      ) : (
        <TableauDonnees
          libelle="Plan d'actions correctives"
          colonnes={colonnesListe}
          lignes={filtres}
          cle={(a) => a._id}
          lien={(a) => `/securite/actions/${a._id}`}
          recherche={{
            placeholder: "N°, action, responsable, source…",
            texte: (a) =>
              `${a.numero} ${a.libelle} ${a.responsableNom} ${libelleSource(a.source)}`,
          }}
          filtres={
            <>
              <SelectFiltre
                libelle="Statut"
                value={statut}
                onChange={setStatut}
              >
                <option value="ouvertes">Non soldées</option>
                <option value="toutes">Tous les statuts</option>
                {Object.entries(STATUTS_ACTION).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre
                libelle="Direction responsable"
                icone={Building2}
                value={direction}
                onChange={setDirection}
              >
                <option value="toutes">Toutes directions</option>
                {Object.entries(DIRECTIONS_RESPONSABLES).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {cle} · {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre
                libelle="Retard"
                icone={Clock}
                value={retard}
                onChange={setRetard}
              >
                <option value="tous">Avec et sans retard</option>
                <option value="retard">En retard seulement</option>
                <option value="dans_les_temps">Dans les temps</option>
              </SelectFiltre>
            </>
          }
          exportNom="actions-correctives-securite"
          imprimable
          triInitial={{ cle: "echeance", sens: "asc" }}
          vide={{
            titre: "Aucune action",
            description:
              "Aucune action corrective ne correspond à ces filtres.",
          }}
        />
      )}
    </CadreSecurite>
  )
}
