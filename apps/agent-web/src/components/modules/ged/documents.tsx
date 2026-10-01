"use client"

import type { FunctionReturnType } from "convex/server"
import { FilePlus2, Search } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { CelluleDouble, LienBouton, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed, MENTION_LECTURE_GED } from "./cadre"
import {
  CLASSIFICATIONS,
  DIRECTIONS,
  STATUTS_DOCUMENT,
  TYPES_DOCUMENT,
  TagClassification,
  TagDemo,
  TagStatutDocument,
  libelleDirection,
  type StatutDocument,
  type TypeDocument,
} from "./statuts"

type Liste = FunctionReturnType<typeof api.modules.ged.queries.listerDocuments>
type Ligne = Liste["lignes"][number]

const jour = (date: string | null) => (date ? dateCourte(Date.parse(`${date}T12:00:00Z`)) : "—")

const colonnes: ColonneTableau<Ligne>[] = [
  {
    cle: "reference",
    libelle: "Référence",
    rendu: (ligne) => <CelluleDouble mono haut={ligne.reference} bas={`v${ligne.versionCourante}`} />,
    tri: (ligne) => ligne.reference,
  },
  {
    cle: "titre",
    libelle: "Pièce",
    rendu: (ligne) => (
      <span className="grid gap-1">
        <CelluleDouble
          haut={ligne.titre}
          bas={[TYPES_DOCUMENT[ligne.type], ligne.correspondant].filter(Boolean).join(" · ")}
        />
        {ligne.motsCles.length > 0 ? (
          <small className="text-[12px] text-ink-muted">{ligne.motsCles.join(" · ")}</small>
        ) : null}
        <TagDemo origine={ligne.origine} />
      </span>
    ),
    tri: (ligne) => ligne.titre,
    export: (ligne) => ligne.titre,
  },
  {
    cle: "type",
    libelle: "Type",
    rendu: (ligne) => TYPES_DOCUMENT[ligne.type],
    tri: (ligne) => TYPES_DOCUMENT[ligne.type],
    secondaire: true,
  },
  {
    cle: "classement",
    libelle: "Série",
    rendu: (ligne) => <CelluleDouble mono haut={ligne.classement.code} bas={libelleDirection(ligne.direction)} />,
    tri: (ligne) => ligne.classement.code,
    export: (ligne) => `${ligne.classement.code} — ${ligne.classement.libelle}`,
    secondaire: true,
  },
  {
    cle: "date",
    libelle: "Date",
    rendu: (ligne) => <span className="tabular">{jour(ligne.dateDocument)}</span>,
    tri: (ligne) => ligne.dateDocument,
  },
  {
    cle: "classification",
    libelle: "Accès",
    rendu: (ligne) => <TagClassification classification={ligne.classification} />,
    tri: (ligne) => Object.keys(CLASSIFICATIONS).indexOf(ligne.classification),
    export: (ligne) => CLASSIFICATIONS[ligne.classification].libelle,
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "État",
    rendu: (ligne) => <TagStatutDocument statut={ligne.statut} />,
    tri: (ligne) => Object.keys(STATUTS_DOCUMENT).indexOf(ligne.statut),
    export: (ligne) => STATUTS_DOCUMENT[ligne.statut].libelle,
  },
  {
    cle: "conservation",
    libelle: "Conservation",
    rendu: (ligne) =>
      ligne.conservationJusquau ? (
        <span className={ligne.conservationEchue ? "font-semibold text-warning-ink" : "tabular"}>
          {ligne.conservationEchue ? "Échue · " : "Jusqu'au "}
          <span className="tabular">{jour(ligne.conservationJusquau)}</span>
        </span>
      ) : (
        "Définitive"
      ),
    tri: (ligne) => ligne.conservationJusquau ?? "9999",
    export: (ligne) => ligne.conservationJusquau ?? "définitive",
    secondaire: true,
  },
  {
    cle: "auteur",
    libelle: "Auteur",
    rendu: (ligne) => ligne.auteur,
    tri: (ligne) => ligne.auteur,
    secondaire: true,
  },
  {
    cle: "maj",
    libelle: "Mise à jour",
    rendu: (ligne) => <span className="tabular">{dateHeure(ligne.updatedAt)}</span>,
    tri: (ligne) => ligne.updatedAt,
    secondaire: true,
  },
]

/** Liste des pièces : recherche plein texte côté serveur, filtres, export. */
export function ListeDocuments() {
  const router = useRouter()
  const serie = useSearchParams().get("serie")
  const droits = useQuery(api.modules.ged.queries.mesDroits, {})
  const [saisie, setSaisie] = useState("")
  const [texte, setTexte] = useState("")
  const [type, setType] = useState("tous")
  const [statut, setStatut] = useState("tous")
  const [direction, setDirection] = useState("toutes")

  useEffect(() => {
    const minuteur = window.setTimeout(() => setTexte(saisie.trim()), 300)
    return () => window.clearTimeout(minuteur)
  }, [saisie])

  const liste = useQuery(api.modules.ged.queries.listerDocuments, {
    ...(texte ? { texte } : {}),
    ...(type !== "tous" ? { type: type as TypeDocument } : {}),
    ...(statut !== "tous" ? { statut: statut as StatutDocument } : {}),
    ...(direction !== "toutes" ? { direction } : {}),
  })

  return (
    <CadreGed
      titre="Documents"
      description="Toutes les pièces que vous pouvez consulter. La recherche porte sur la référence, le titre, la description, les mots-clés, le correspondant et la série de classement."
      lectureSeule={droits && !droits.peutCreer ? MENTION_LECTURE_GED : undefined}
      actions={
        droits?.peutCreer ? (
          <LienBouton href="/bureautique/documents/nouveau" variante="primary">
            <FilePlus2 />
            Déposer une pièce
          </LienBouton>
        ) : null
      }
    >
      <label className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
        <Search aria-hidden className="size-4 text-ink-muted" />
        <span className="sr-only">Rechercher dans la GED</span>
        <input
          type="search"
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          placeholder="Rechercher : avenant minerai, ARTF, GED-2026-000012…"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-faint"
        />
      </label>
      {liste?.limiteAtteinte ? (
        <InlineMessage tone="info" title="Résultats limités.">
          Seules les premières pièces sont affichées : précisez la recherche ou les filtres.
        </InlineMessage>
      ) : null}
      {liste && liste.masques > 0 ? (
        <p className="text-small text-ink-muted" role="status">
          {liste.masques} pièce{liste.masques > 1 ? "s" : ""} correspondante{liste.masques > 1 ? "s" : ""} vous{" "}
          {liste.masques > 1 ? "sont" : "est"} fermée{liste.masques > 1 ? "s" : ""} (confidentielle ou restreinte).
        </p>
      ) : null}
      <TableauDonnees
        libelle="Pièces de la GED"
        colonnes={colonnes}
        lignes={serie ? liste?.lignes.filter((ligne) => ligne.classement.code === serie) : liste?.lignes}
        cle={(ligne) => ligne._id}
        lien={(ligne) => `/bureautique/documents/${ligne._id}`}
        filtres={
          <>
            {serie ? (
              <Tag
                tone="filterOn"
                onRemove={() => router.replace("/bureautique/documents" as Route)}
                removeLabel={`Retirer le filtre de série ${serie}`}
              >
                Série <span className="tabular">{serie}</span>
              </Tag>
            ) : null}
            <SelectFiltre libelle="Type" value={type} onChange={setType}>
              <option value="tous">Tous les types</option>
              {Object.entries(TYPES_DOCUMENT).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
              <option value="tous">Tous les états</option>
              {Object.entries(STATUTS_DOCUMENT).map(([cle, definition]) => (
                <option key={cle} value={cle}>
                  {definition.libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Direction" value={direction} onChange={setDirection}>
              <option value="toutes">Toutes les directions</option>
              {Object.entries(DIRECTIONS).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        exportNom="ged-pieces"
        imprimable
        triInitial={texte ? undefined : { cle: "maj", sens: "desc" }}
        vide={{
          titre: texte ? "Aucune pièce ne correspond" : "Aucune pièce",
          description: texte
            ? "Essayez d'autres mots-clés, ou retirez un filtre."
            : "Aucune pièce consultable avec ces filtres.",
        }}
      />
    </CadreGed>
  )
}
