"use client"

import { Activity, Ban, Clock, Plus, RadioTower, TriangleAlert } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"

import { CadreInfra, TagEtat, TagRetard, infraApi, pk, plagePk, useDroitsInfra, type LigneEquipementInfra } from "../commun"
import { FenetreEquipement } from "./formulaires"
import { CATEGORIES_EQUIPEMENT, ETATS_EQUIPEMENT, ORDRE_CATEGORIES, capaciteEquipement, type CategorieEquipement } from "./libelles"

type Onglet = "tous" | CategorieEquipement

/** PK ponctuel, ou plage pour un équipement linéaire (fibre, câble). */
export const positionEquipement = (e: Pick<LigneEquipementInfra, "pk" | "pkFin">) => (e.pkFin !== null ? plagePk(e.pk, e.pkFin) : pk(e.pk))

const RANG_ETAT: Record<string, number> = { hors_service: 0, degrade: 1, en_service: 2 }

const colonnes: ColonneTableau<LigneEquipementInfra>[] = [
  { cle: "code", libelle: "Code", rendu: (e) => <span className="tabular font-semibold">{e.code}</span>, tri: (e) => e.code },
  { cle: "libelle", libelle: "Équipement", rendu: (e) => <CelluleDouble haut={e.libelle} bas={e.categorieLibelle} />, tri: (e) => e.libelle },
  { cle: "categorie", libelle: "Catégorie", rendu: (e) => e.categorieLibelle, tri: (e) => e.categorieLibelle, secondaire: true },
  { cle: "type", libelle: "Type", rendu: (e) => e.type, tri: (e) => e.type },
  { cle: "pk", libelle: "PK", rendu: (e) => <span className="tabular whitespace-nowrap">{positionEquipement(e)}</span>, tri: (e) => e.pk, export: (e) => positionEquipement(e), numerique: true },
  { cle: "section", libelle: "Section", rendu: (e) => e.sectionLibelle ?? "—", tri: (e) => e.sectionLibelle, secondaire: true },
  { cle: "etat", libelle: "État", rendu: (e) => <TagEtat valeur={e.etat} libelle={e.etatLibelle} />, tri: (e) => RANG_ETAT[e.etat], export: (e) => e.etatLibelle },
  { cle: "alimentation", libelle: "Alimentation", rendu: (e) => e.alimentation ?? "—", tri: (e) => e.alimentation, secondaire: true },
  {
    cle: "derniere",
    libelle: "Dernière maintenance",
    rendu: (e) => <span className="tabular">{dateCourte(e.derniereMaintenanceLe)}</span>,
    tri: (e) => e.derniereMaintenanceLe,
    export: (e) => dateCourte(e.derniereMaintenanceLe),
    secondaire: true,
  },
  {
    cle: "prochaine",
    libelle: "Prochaine maintenance",
    rendu: (e) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular">{e.prochaineMaintenanceLe ? dateCourte(e.prochaineMaintenanceLe) : "À programmer"}</span>
        {e.maintenanceEnRetard ? <TagRetard texte="Maintenance en retard" /> : null}
      </span>
    ),
    tri: (e) => e.prochaineMaintenanceLe,
    export: (e) => `${e.prochaineMaintenanceLe ? dateCourte(e.prochaineMaintenanceLe) : "À programmer"}${e.maintenanceEnRetard ? " (maintenance en retard)" : ""}`,
  },
]

export function EquipementsEcran() {
  const router = useRouter()
  const droits = useDroitsInfra()
  const equipements = useQuery(infraApi.queries.equipements, {})
  const operation = useOperation()
  const [onglet, setOnglet] = useState<Onglet>("tous")
  const [etat, setEtat] = useState("tous")
  const [retard, setRetard] = useState("tous")
  const [creation, setCreation] = useState(false)
  const [cleFenetre, setCleFenetre] = useState(0)

  const categoriesGerees = ORDRE_CATEGORIES.filter((c) => droits.peut(capaciteEquipement(c)))
  const duTab = equipements?.filter((e) => onglet === "tous" || e.categorie === onglet)
  const filtres = duTab?.filter((e) => (etat === "tous" || e.etat === etat) && (retard === "tous" || (retard === "retard" ? e.maintenanceEnRetard : !e.maintenanceEnRetard)))
  const compte = (c: CategorieEquipement) => equipements?.filter((e) => e.categorie === c).length
  const charge = duTab !== undefined
  const degrades = duTab?.filter((e) => e.etat === "degrade").length ?? 0
  const horsService = duTab?.filter((e) => e.etat === "hors_service").length ?? 0
  const enRetard = duTab?.filter((e) => e.maintenanceEnRetard).length ?? 0
  const disponibilite = duTab && duTab.length > 0 ? Math.round((duTab.filter((e) => e.etat === "en_service").length / duTab.length) * 100) : null

  return (
    <CadreInfra
      titre="Signalisation, passages à niveau et télécoms"
      description="Inventaire des installations fixes de sécurité et de communication, leur état et le calendrier de leur maintenance préventive."
      actions={
        categoriesGerees.length > 0 ? (
          <Button
            type="button"
            onClick={() => {
              setCleFenetre((c) => c + 1)
              setCreation(true)
            }}
          >
            <Plus />
            Ajouter un équipement
          </Button>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      <Onglets
        libelle="Catégorie d'équipement"
        valeur={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: "tous" as const, libelle: "Tous", compte: equipements?.length },
          ...ORDRE_CATEGORIES.map((c) => ({ cle: c, libelle: CATEGORIES_EQUIPEMENT[c], compte: compte(c) })),
        ]}
      />
      <div role="tabpanel" className="grid gap-5">
        <Indicateurs>
          <Indicateur
            libelle="Équipements"
            icone={RadioTower}
            valeur={charge ? nombre(duTab.length) : "…"}
            remplissage={disponibilite !== null ? disponibilite / 100 : undefined}
            evolution={disponibilite !== null ? { sens: "neutre", texte: `${disponibilite} % en service` } : undefined}
          />
          <Indicateur libelle="Dégradés" icone={TriangleAlert} valeur={charge ? nombre(degrades) : "…"} evolution={degrades > 0 ? { sens: "vigilance", texte: "Fonctionnement réduit" } : undefined} />
          <Indicateur libelle="Hors service" icone={Ban} valeur={charge ? nombre(horsService) : "…"} evolution={horsService > 0 ? { sens: "baisse", texte: "Mesures de sécurité à appliquer" } : undefined} />
          <Indicateur libelle="Maintenances en retard" icone={Clock} valeur={charge ? nombre(enRetard) : "…"} evolution={charge ? { sens: enRetard > 0 ? "vigilance" : "neutre", texte: enRetard > 0 ? "Échéance préventive dépassée" : "Calendrier tenu" } : undefined} />
        </Indicateurs>
        <TableauDonnees
          libelle="Inventaire des équipements"
          colonnes={colonnes}
          lignes={filtres}
          cle={(e) => e.id}
          lien={(e) => `/infrastructures/equipements/${e.id}`}
          recherche={{ placeholder: "Code, libellé, type, section…", texte: (e) => `${e.code} ${e.libelle} ${e.type} ${e.sectionLibelle ?? ""} ${e.alimentation ?? ""}` }}
          filtres={
            <>
              <SelectFiltre libelle="État" icone={Activity} value={etat} onChange={setEtat}>
                <option value="tous">Tous les états</option>
                {Object.entries(ETATS_EQUIPEMENT).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre libelle="Maintenance" icone={Clock} value={retard} onChange={setRetard}>
                <option value="tous">Toutes les maintenances</option>
                <option value="retard">Maintenance en retard</option>
                <option value="a_jour">Maintenance à jour</option>
              </SelectFiltre>
            </>
          }
          exportNom={onglet === "tous" ? "equipements" : `equipements-${onglet}`}
          triInitial={{ cle: "pk", sens: "asc" }}
          vide={{
            titre: duTab && duTab.length > 0 ? "Aucun équipement pour ces filtres" : "Aucun équipement inventorié",
            description: duTab && duTab.length > 0 ? "Élargissez l'état ou la maintenance." : "Cette catégorie ne compte encore aucun équipement.",
          }}
        />
      </div>
      {categoriesGerees.length > 0 ? (
        <FenetreEquipement
          key={cleFenetre}
          open={creation}
          onOpenChange={setCreation}
          operation={operation}
          categories={categoriesGerees}
          categorieInitiale={onglet === "tous" ? undefined : onglet}
          onCree={(id) => router.push(`/infrastructures/equipements/${id}` as Route)}
        />
      ) : null}
    </CadreInfra>
  )
}
