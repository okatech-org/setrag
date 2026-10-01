"use client"

import type { FunctionReturnType } from "convex/server"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { CelluleDouble, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed } from "./cadre"
import {
  NATURES_ETAPE,
  STATUTS_CIRCUIT,
  TYPES_DOCUMENT,
  TagCircuit,
  TagClassification,
  TagDemo,
  type StatutCircuit,
} from "./statuts"

type Ligne = FunctionReturnType<typeof api.modules.ged.queries.listerCircuits>[number]
type Portee = "a_traiter" | "inities" | "tous"

const colonnes: ColonneTableau<Ligne>[] = [
  {
    cle: "piece",
    libelle: "Pièce",
    rendu: (ligne) => (
      <span className="grid gap-1">
        <CelluleDouble haut={ligne.document.titre} bas={<span className="tabular">{ligne.document.reference}</span>} />
        <TagDemo origine={ligne.origine} />
      </span>
    ),
    tri: (ligne) => ligne.document.reference,
    export: (ligne) => `${ligne.document.reference} — ${ligne.document.titre}`,
  },
  {
    cle: "type",
    libelle: "Type",
    rendu: (ligne) => TYPES_DOCUMENT[ligne.document.type],
    tri: (ligne) => ligne.document.type,
    export: (ligne) => TYPES_DOCUMENT[ligne.document.type],
    secondaire: true,
  },
  {
    cle: "etape",
    libelle: "Étape en cours",
    rendu: (ligne) =>
      ligne.actuelle ? (
        <CelluleDouble
          haut={
            <>
              {ligne.actuelle.libelle}
              {ligne.actuelle.aMoi ? <span className="ml-2 text-[12.5px] font-semibold text-accent-ink">· à vous</span> : null}
            </>
          }
          bas={`${NATURES_ETAPE[ligne.actuelle.nature]} · ${ligne.actuelle.assigne}`}
        />
      ) : (
        <span className="text-ink-muted">—</span>
      ),
    tri: (ligne) => ligne.actuelle?.libelle ?? "",
    export: (ligne) => (ligne.actuelle ? `${ligne.actuelle.libelle} (${ligne.actuelle.assigne})` : ""),
  },
  {
    cle: "avancement",
    libelle: "Avancement",
    rendu: (ligne) => (
      <span className="tabular">
        {ligne.etapesFaites} / {ligne.totalEtapes}
      </span>
    ),
    tri: (ligne) => ligne.etapesFaites / ligne.totalEtapes,
    export: (ligne) => `${ligne.etapesFaites}/${ligne.totalEtapes}`,
    numerique: true,
  },
  {
    cle: "parcours",
    libelle: "Parcours",
    rendu: (ligne) => <small className="text-[12.5px] text-ink-muted">{ligne.parcours}</small>,
    tri: (ligne) => ligne.parcours,
    secondaire: true,
  },
  {
    cle: "acces",
    libelle: "Accès",
    rendu: (ligne) => <TagClassification classification={ligne.document.classification} />,
    tri: (ligne) => ligne.document.classification,
    secondaire: true,
  },
  {
    cle: "initie",
    libelle: "Lancé",
    rendu: (ligne) => <CelluleDouble haut={<span className="tabular">{dateHeure(ligne.initieLe)}</span>} bas={ligne.initiePar} />,
    tri: (ligne) => ligne.initieLe,
    export: (ligne) => new Date(ligne.initieLe),
  },
  {
    cle: "statut",
    libelle: "État",
    rendu: (ligne) => <TagCircuit statut={ligne.statut} />,
    tri: (ligne) => Object.keys(STATUTS_CIRCUIT).indexOf(ligne.statut),
    export: (ligne) => STATUTS_CIRCUIT[ligne.statut].libelle,
  },
]

/** Parapheur : ce qui m'attend, ce que j'ai lancé, tous les circuits visibles. */
export function Parapheur() {
  const [portee, setPortee] = useState<Portee>("a_traiter")
  const [statut, setStatut] = useState("tous")
  const aTraiter = useQuery(api.modules.ged.queries.listerCircuits, { portee: "a_traiter" })
  const lignes = useQuery(api.modules.ged.queries.listerCircuits, { portee })
  const filtrees = lignes?.filter((ligne) => statut === "tous" || ligne.statut === statut)

  return (
    <CadreGed
      titre="Parapheur"
      description="Visas, signatures et diffusions. Ouvrez une pièce pour décider : un refus porte toujours son motif et renvoie la pièce à son auteur."
    >
      <Onglets
        libelle="Circuits"
        valeur={portee}
        onChange={(cle) => {
          setPortee(cle)
          setStatut("tous")
        }}
        onglets={[
          { cle: "a_traiter", libelle: "À traiter", compte: aTraiter?.length },
          { cle: "inities", libelle: "Lancés par moi" },
          { cle: "tous", libelle: "Tous les circuits" },
        ]}
      />
      <div role="tabpanel">
        <TableauDonnees
          libelle="Circuits de validation"
          colonnes={colonnes}
          lignes={filtrees}
          cle={(ligne) => ligne._id}
          lien={(ligne) => `/bureautique/documents/${ligne.document._id}#circuit`}
          recherche={{
            placeholder: "Référence, titre, intervenant…",
            texte: (ligne) => `${ligne.document.reference} ${ligne.document.titre} ${ligne.parcours} ${ligne.initiePar}`,
          }}
          filtres={
            portee === "a_traiter" ? null : (
              <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
                <option value="tous">Tous les états</option>
                {(Object.keys(STATUTS_CIRCUIT) as StatutCircuit[]).map((cle) => (
                  <option key={cle} value={cle}>
                    {STATUTS_CIRCUIT[cle].libelle}
                  </option>
                ))}
              </SelectFiltre>
            )
          }
          exportNom={`parapheur-${portee}`}
          imprimable
          triInitial={{ cle: "initie", sens: portee === "a_traiter" ? "asc" : "desc" }}
          vide={
            portee === "a_traiter"
              ? { titre: "Rien ne vous attend", description: "Aucune pièce n'attend votre visa, votre signature ou votre diffusion." }
              : { titre: "Aucun circuit", description: "Aucun circuit visible avec ces critères." }
          }
        />
      </div>
    </CadreGed>
  )
}
