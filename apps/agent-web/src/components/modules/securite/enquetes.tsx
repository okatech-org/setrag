"use client"

import type { FunctionReturnType } from "convex/server"
import { Clock } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  CelluleDouble,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { AccesRestreint, dateIso } from "@/components/modules/rh/commun"

import {
  CadreSecurite,
  TagEnquete,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import {
  CATEGORIES_CAUSE,
  GRAVITES,
  RANG_GRAVITE,
  STATUTS_ENQUETE,
  libelleType,
} from "./libelles"

type Enquete = FunctionReturnType<
  typeof api.modules.securite.enquetes.lister
>[number]

const colonnes: ColonneTableau<Enquete>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (e) => <span className="tabular font-semibold">{e.numero}</span>,
    tri: (e) => e.numero,
  },
  {
    cle: "evenement",
    libelle: "Événement",
    rendu: (e) =>
      e.evenement ? (
        <CelluleDouble
          haut={`${e.evenement.numero} · ${libelleType(e.evenement.type)}`}
          bas={`${dateHeureComplete(e.evenement.survenuLe)} · ${e.evenement.lieu}`}
        />
      ) : (
        "—"
      ),
    tri: (e) => e.evenement?.numero ?? "",
    export: (e) =>
      e.evenement
        ? `${e.evenement.numero} — ${libelleType(e.evenement.type)}`
        : "",
  },
  {
    cle: "gravite",
    libelle: "Gravité",
    rendu: (e) =>
      e.evenement ? <TagGravite gravite={e.evenement.gravite} /> : "—",
    tri: (e) => (e.evenement ? RANG_GRAVITE[e.evenement.gravite] : null),
    export: (e) => (e.evenement ? GRAVITES[e.evenement.gravite] : ""),
    secondaire: true,
  },
  {
    cle: "enqueteur",
    libelle: "Enquêteur",
    rendu: (e) => e.enqueteurNom,
    tri: (e) => e.enqueteurNom,
    secondaire: true,
  },
  {
    cle: "ouverte",
    libelle: "Ouverte le",
    rendu: (e) => (
      <span className="tabular">{dateHeureComplete(e.ouverteLe)}</span>
    ),
    tri: (e) => e.ouverteLe,
    export: (e) => dateHeureComplete(e.ouverteLe),
    secondaire: true,
  },
  {
    cle: "echeance",
    libelle: "Rapport attendu",
    rendu: (e) => (
      <span className="flex flex-wrap items-center gap-1">
        <span className="tabular whitespace-nowrap">
          {dateIso(e.echeanceRapport)}
        </span>
        {e.enRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (e) => e.echeanceRapport,
    export: (e) => `${e.echeanceRapport}${e.enRetard ? " (en retard)" : ""}`,
  },
  {
    cle: "causes",
    libelle: "Causes racines",
    rendu: (e) =>
      e.causesRacines.length > 0 ? (
        e.causesRacines.map((c) => CATEGORIES_CAUSE[c]).join(", ")
      ) : (
        <span className="text-ink-muted">À établir</span>
      ),
    export: (e) => e.causesRacines.map((c) => CATEGORIES_CAUSE[c]).join(", "),
    secondaire: true,
  },
  {
    cle: "actions",
    libelle: "Actions",
    rendu: (e) => (
      <span className="tabular">
        {e.actions}
        {e.actionsEnRetard > 0 ? (
          <small className="ml-1 text-danger-ink">
            dont {e.actionsEnRetard} en retard
          </small>
        ) : null}
      </span>
    ),
    tri: (e) => e.actions,
    numerique: true,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (e) => <TagEnquete statut={e.statut} />,
    tri: (e) => e.statut,
    export: (e) => STATUTS_ENQUETE[e.statut],
  },
]

export function ListeEnquetes() {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const enquetes = useQuery(
    api.modules.securite.enquetes.lister,
    lecture ? {} : "skip"
  )
  const [statut, setStatut] = useState("en_cours")
  const [retard, setRetard] = useState("tous")
  const filtres = enquetes?.filter(
    (e) =>
      (statut === "toutes" ||
        (statut === "en_cours"
          ? e.statut !== "cloturee"
          : e.statut === statut)) &&
      (retard === "tous" || (retard === "retard" ? e.enRetard : !e.enRetard))
  )
  return (
    <CadreSecurite
      titre="Enquêtes"
      description="Enquêtes internes ouvertes sur les événements de sécurité : constats, causes, recommandations et plan d'actions correctives. Les enquêtes s'ouvrent depuis le dossier de l'événement."
    >
      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas les enquêtes de sécurité.
        </AccesRestreint>
      ) : (
        <TableauDonnees
          libelle="Enquêtes de sécurité"
          colonnes={colonnes}
          lignes={filtres}
          cle={(e) => e._id}
          lien={(e) => `/securite/enquetes/${e._id}`}
          recherche={{
            placeholder: "N°, événement, enquêteur…",
            texte: (e) =>
              `${e.numero} ${e.enqueteurNom} ${e.evenement?.numero ?? ""} ${e.evenement ? libelleType(e.evenement.type) : ""} ${e.evenement?.lieu ?? ""}`,
          }}
          filtres={
            <>
              <SelectFiltre
                libelle="Statut"
                value={statut}
                onChange={setStatut}
              >
                <option value="en_cours">Non clôturées</option>
                <option value="toutes">Tous les statuts</option>
                {Object.entries(STATUTS_ENQUETE).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
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
          exportNom="enquetes-securite"
          imprimable
          triInitial={{ cle: "echeance", sens: "asc" }}
          vide={{
            titre: "Aucune enquête",
            description: "Aucune enquête ne correspond à ces filtres.",
          }}
        />
      )}
    </CadreSecurite>
  )
}
