"use client"

import type { FunctionReturnType } from "convex/server"
import { CheckCheck } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed } from "./cadre"
import { TagDemo, libelleDirection } from "./statuts"

type Ligne = FunctionReturnType<typeof api.modules.ged.queries.listerNotes>[number]

function BoutonLu({ ligne }: { ligne: Ligne }) {
  const accuser = useMutation(api.modules.ged.mutations.accuserLecture)
  const operation = useOperation()
  if (ligne.luLe) {
    return (
      <Tag tone="success">
        <CheckCheck aria-hidden />
        Lu le <span className="tabular">{dateHeure(ligne.luLe)}</span>
      </Tag>
    )
  }
  if (!ligne.concerne || ligne.statut !== "diffuse") return <span className="text-small text-ink-muted">Non destinataire</span>
  return (
    <span className="grid gap-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={operation.enCours === "lu"}
        onClick={() => void operation.executer("lu", () => accuser({ documentId: ligne._id }))}
      >
        <CheckCheck />
        J’ai lu
      </Button>
      <RetourOperation retour={operation.retour?.ton === "danger" ? operation.retour : null} />
    </span>
  )
}

const colonnes: ColonneTableau<Ligne>[] = [
  {
    cle: "note",
    libelle: "Note",
    rendu: (ligne) => (
      <span className="grid gap-1">
        <CelluleDouble haut={ligne.titre} bas={<span className="tabular">{ligne.reference}</span>} />
        <TagDemo origine={ligne.origine} />
      </span>
    ),
    tri: (ligne) => ligne.titre,
    export: (ligne) => `${ligne.reference} — ${ligne.titre}`,
  },
  {
    cle: "emetteur",
    libelle: "Émetteur",
    rendu: (ligne) => libelleDirection(ligne.direction),
    tri: (ligne) => ligne.direction,
    secondaire: true,
  },
  {
    cle: "diffusee",
    libelle: "Diffusée",
    rendu: (ligne) => <span className="tabular">{dateHeure(ligne.diffuseLe)}</span>,
    tri: (ligne) => ligne.diffuseLe,
    export: (ligne) => new Date(ligne.diffuseLe),
  },
  { cle: "audience", libelle: "Audience", rendu: (ligne) => ligne.audience, tri: (ligne) => ligne.audience, secondaire: true },
  {
    cle: "lectures",
    libelle: "Lectures",
    rendu: (ligne) => (
      <span className="tabular">
        {ligne.lus} / {ligne.destinataires}
      </span>
    ),
    tri: (ligne) => (ligne.destinataires ? ligne.lus / ligne.destinataires : 0),
    export: (ligne) => `${ligne.lus}/${ligne.destinataires}`,
    numerique: true,
  },
  {
    cle: "moi",
    libelle: "Ma lecture",
    rendu: (ligne) => <BoutonLu ligne={ligne} />,
    tri: (ligne) => (ligne.luLe ? 1 : ligne.concerne ? 0 : 2),
    export: (ligne) => (ligne.luLe ? new Date(ligne.luLe) : ligne.concerne ? "à lire" : "non destinataire"),
  },
]

/** Notes de service diffusées, avec accusés de lecture. */
export function NotesDeService() {
  const notes = useQuery(api.modules.ged.queries.listerNotes, {})
  const [filtre, setFiltre] = useState("toutes")
  const lignes = notes?.filter((ligne) =>
    filtre === "a_lire" ? ligne.concerne && !ligne.luLe && ligne.statut === "diffuse" : filtre === "lues" ? Boolean(ligne.luLe) : true
  )
  const aLire = notes?.filter((ligne) => ligne.concerne && !ligne.luLe && ligne.statut === "diffuse").length ?? 0
  const lectures = notes?.reduce((total, ligne) => total + ligne.lus, 0) ?? 0
  const attendues = notes?.reduce((total, ligne) => total + ligne.destinataires, 0) ?? 0

  return (
    <CadreGed
      titre="Notes de service"
      description="Les notes signées puis diffusées par le circuit de validation. Chaque destinataire accuse lecture ; l'émetteur suit le taux de lecture."
    >
      {notes ? (
        <Indicateurs colonnes={3}>
          <Indicateur
            libelle="À lire"
            valeur={aLire}
            evolution={{ sens: aLire > 0 ? "vigilance" : "neutre", texte: aLire > 0 ? "Accusé de lecture attendu" : "Vous êtes à jour" }}
          />
          <Indicateur libelle="Notes diffusées" valeur={notes.length} />
          <Indicateur
            libelle="Lectures enregistrées"
            valeur={lectures}
            unite={`sur ${attendues}`}
            remplissage={attendues ? lectures / attendues : undefined}
          />
        </Indicateurs>
      ) : null}
      <TableauDonnees
        libelle="Notes de service"
        colonnes={colonnes}
        lignes={lignes}
        cle={(ligne) => ligne._id}
        lien={(ligne) => `/bureautique/documents/${ligne._id}`}
        recherche={{ placeholder: "Titre, référence…", texte: (ligne) => `${ligne.reference} ${ligne.titre}` }}
        filtres={
          <SelectFiltre libelle="Lecture" value={filtre} onChange={setFiltre}>
            <option value="toutes">Toutes les notes</option>
            <option value="a_lire">À lire ({aLire})</option>
            <option value="lues">Lues</option>
          </SelectFiltre>
        }
        exportNom="notes-de-service"
        imprimable
        triInitial={{ cle: "diffusee", sens: "desc" }}
        vide={
          filtre === "a_lire"
            ? { titre: "Rien à lire", description: "Vous avez accusé lecture de toutes vos notes." }
            : { titre: "Aucune note diffusée", description: "Les notes apparaissent ici une fois signées et diffusées." }
        }
      />
    </CadreGed>
  )
}
