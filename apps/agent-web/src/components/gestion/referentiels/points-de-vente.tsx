"use client"

import type { FunctionReturnType } from "convex/server"
import { Building2, Globe, LockOpen, MapPin, Plus, Store } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { DialoguePointDeVente } from "@/components/point-of-sale-detail"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { Onglets } from "./elements"
import { millions, nombre, TYPES_POINT_DE_VENTE } from "./format"
import { Pastille, TagActif } from "./statuts"

type Vue = NonNullable<FunctionReturnType<typeof api.functions.referentiels.pointsDeVente>>
type Point = Vue["lignes"][number]

const colonnes: ColonneTableau<Point>[] = [
  { cle: "code", libelle: "Code", rendu: (p) => <span className="tabular font-semibold">{p.code}</span>, tri: (p) => p.code },
  {
    cle: "nom",
    libelle: "Point de vente",
    rendu: (p) => (
      <CelluleDouble
        haut={p.name}
        bas={p.type === "gare" ? (p.station ? `PK ${p.station.kilometerPoint}` : "sans gare") : p.placesEnQuota > 0 ? `${p.placesEnQuota} places en quota` : `commission ${p.royaltyPct ?? 0} %`}
      />
    ),
    tri: (p) => p.name,
  },
  { cle: "type", libelle: "Type", rendu: (p) => TYPES_POINT_DE_VENTE[p.type], tri: (p) => p.type, secondaire: true },
  { cle: "postes", libelle: "Postes", rendu: (p) => p.postes, tri: (p) => p.postes, numerique: true, secondaire: true },
  { cle: "caisses", libelle: "Caisses ouvertes", rendu: (p) => (p.caissesOuvertes > 0 ? p.caissesOuvertes : "—"), tri: (p) => p.caissesOuvertes, numerique: true },
  { cle: "recette", libelle: "Recette · mois", rendu: (p) => (p.recetteMois ? millions(p.recetteMois) : "—"), tri: (p) => p.recetteMois, numerique: true, export: (p) => p.recetteMois },
  {
    cle: "etat",
    libelle: "État",
    rendu: (p) =>
      p.isActive ? (
        p.postes === 0 ? (
          <Pastille ton="neutral">Sans poste de vente</Pastille>
        ) : (
          <TagActif actif oui={p.type === "gare" ? "Ouvert" : "Accréditée"} />
        )
      ) : (
        <TagActif actif={false} />
      ),
    tri: (p) => (p.isActive ? 0 : 1),
    export: (p) => (p.isActive ? "Actif" : "Suspendu"),
  },
]

export function PointsDeVenteListe() {
  const router = useRouter()
  const droits = useDroitsGestion()
  const vue = useQuery(api.functions.referentiels.pointsDeVente, droits.may("referentiel") ? {} : "skip")
  const [onglet, setOnglet] = useState<"tous" | "gares" | "agences">("tous")
  const [creation, setCreation] = useState(false)
  const lignes = vue?.lignes.filter((p) => (onglet === "tous" ? true : onglet === "gares" ? p.type === "gare" : p.type !== "gare"))
  const nbGares = vue?.lignes.filter((p) => p.type === "gare").length
  const peutCreer = droits.may("referentiel", "creer")

  return (
    <CadreGestion
      surtitre="Commercial · réseau de vente"
      titre="Points de vente"
      description="Gares, agences accréditées et canaux en ligne. Chaque point a ses guichets, ses vendeurs et, pour les agences, un quota de places."
      lectureSeule={!droits.chargement && !droits.may("referentiel", "modifier") ? mentionLectureSeule(droits.role, "le réseau de vente") : undefined}
      actions={
        peutCreer ? (
          <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
            <Plus />
            Créer ou accréditer
          </Button>
        ) : null
      }
    >
      <Indicateurs colonnes={5}>
        <Indicateur libelle="Gares" icone={MapPin} valeur={vue ? nombre(vue.gares) : "…"} evolution={vue ? { sens: "neutre", texte: `${vue.garesEquipees} équipées pour la vente` } : undefined} />
        <Indicateur
          libelle="Postes de vente"
          icone={Store}
          valeur={vue ? nombre(vue.postes) : "…"}
          evolution={vue ? { sens: "neutre", texte: `${vue.postesParProduit.passengers} voyageurs · ${vue.postesParProduit.baggage} bagages · ${vue.postesParProduit.parcels} colis` } : undefined}
        />
        <Indicateur libelle="Caisses ouvertes" icone={LockOpen} valeur={vue ? nombre(vue.caissesOuvertes) : "…"} evolution={{ sens: "neutre", texte: "en ce moment" }} />
        <Indicateur libelle="Agences accréditées" icone={Building2} valeur={vue ? nombre(vue.agences) : "…"} />
        <Indicateur libelle="Vente en ligne · mois" icone={Globe} valeur={vue ? millions(vue.recetteEnLigne) : "…"} unite="XAF" evolution={{ sens: "neutre", texte: "billetterie web et application" }} />
      </Indicateurs>
      <Panneau plein>
        <div className="px-4 pt-2">
          <Onglets
            libelle="Type de point de vente"
            valeur={onglet}
            onChange={setOnglet}
            onglets={[
              { cle: "tous", libelle: "Tous", compte: vue?.lignes.length },
              { cle: "gares", libelle: "Gares", compte: nbGares },
              { cle: "agences", libelle: "Agences", compte: vue ? vue.lignes.length - (nbGares ?? 0) : undefined },
            ]}
          />
        </div>
        <div role="tabpanel" className="p-3">
          <TableauDonnees
            libelle="Points de vente"
            colonnes={colonnes}
            lignes={lignes}
            cle={(p) => p._id}
            lien={(p) => `/gestion/points-de-vente/${p._id}`}
            recherche={{ placeholder: "Code, nom, gare…", texte: (p) => `${p.code} ${p.name} ${p.station?.name ?? ""}` }}
            exportNom="points-de-vente"
            vide={{ titre: "Aucun point de vente", description: "Créez une gare ou accréditez une agence." }}
          />
          <p className="px-1 pt-2 text-[12.5px] text-ink-muted">La vente en ligne n’a pas de guichet : sa recette figure à part, dans l’indicateur « Vente en ligne ».</p>
        </div>
      </Panneau>
      <DialoguePointDeVente open={creation} onOpenChange={setCreation} typeInitial={onglet === "agences" ? "agence_accreditee" : "gare"} onCree={(id) => router.push(`/gestion/points-de-vente/${id}`)} />
    </CadreGestion>
  )
}
