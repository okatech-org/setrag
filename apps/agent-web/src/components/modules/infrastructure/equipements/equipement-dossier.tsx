"use client"

import { Activity, CalendarClock, RadioTower, Wrench } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte } from "@/components/gestion/referentiels/format"

import { CadreInfra, DossierEnChargement, DossierIntrouvable, TagEtat, TagRetard, infraApi, useDroitsInfra, type DossierEquipementInfra } from "../commun"
import { AnomaliesLiees, PanneauChronologie, dateEtHeure } from "../interventions/partage"
import { positionEquipement } from "./equipements"
import { FenetreEtatEquipement, FenetreMaintenance } from "./formulaires"
import { capaciteEquipement } from "./libelles"

const RETOUR = { href: "/infrastructures/equipements", libelle: "Signalisation et télécoms" }

type Evenement = DossierEquipementInfra["chronologie"][number]

const colonnesMaintenance: ColonneTableau<Evenement>[] = [
  { cle: "date", libelle: "Enregistrée le", rendu: (e) => <span className="tabular">{dateEtHeure(e.creeLe)}</span>, tri: (e) => e.creeLe, export: (e) => dateEtHeure(e.creeLe) },
  { cle: "resultat", libelle: "Résultat", rendu: (e) => <span className="font-semibold">{e.libelle}</span>, tri: (e) => e.libelle },
  { cle: "compte", libelle: "Compte rendu", rendu: (e) => e.detail ?? "—", tri: (e) => e.detail },
  { cle: "agent", libelle: "Agent", rendu: (e) => e.auteurNom ?? "Système", tri: (e) => e.auteurNom, secondaire: true },
]

/** Les maintenances se lisent dans la chronologie de l'équipement. */
export const estMaintenance = (e: { type: string }) => e.type === "equipement_maintenance"

export function EquipementDossier({ equipementId }: { equipementId: string }) {
  const droits = useDroitsInfra()
  const dossier = useQuery(infraApi.queries.equipement, { equipementId: equipementId as DossierEquipementInfra["equipement"]["id"] })
  const operation = useOperation()
  const [mode, setMode] = useState<"etat" | "maintenance" | null>(null)
  const [cleFenetre, setCleFenetre] = useState(0)

  if (dossier === undefined) {
    return (
      <CadreInfra titre="Équipement" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Équipement introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Équipement" retour={RETOUR} />
      </CadreInfra>
    )
  }

  const { equipement } = dossier
  const peutGerer = droits.peut(capaciteEquipement(equipement.categorie))
  const maintenances = dossier.chronologie.filter(estMaintenance)
  const ouvrir = (m: "etat" | "maintenance") => {
    setCleFenetre((c) => c + 1)
    operation.effacer()
    setMode(m)
  }

  return (
    <CadreInfra
      titre={`${equipement.code} · ${equipement.libelle}`}
      description={`${equipement.categorieLibelle}, ${equipement.type}, ${positionEquipement(equipement)}${equipement.sectionLibelle ? ` (section ${equipement.sectionLibelle})` : ""}.`}
      retour={RETOUR}
      actions={
        peutGerer ? (
          <>
            <Button type="button" variant="secondary" onClick={() => ouvrir("etat")}>
              <Activity />
              Changer l&apos;état
            </Button>
            <Button type="button" onClick={() => ouvrir("maintenance")}>
              <Wrench />
              Enregistrer une maintenance
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={equipement.etat} libelle={equipement.etatLibelle} />
        {equipement.maintenanceEnRetard ? <TagRetard texte="Maintenance en retard" /> : null}
      </div>
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche de l'équipement" icone={RadioTower}>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{equipement.code}</span>],
                ["Catégorie", equipement.categorieLibelle],
                ["Type", equipement.type],
                [equipement.pkFin !== null ? "Plage kilométrique" : "Point kilométrique", <span key="p" className="tabular">{positionEquipement(equipement)}</span>],
                ["Section", equipement.sectionLibelle ?? "Hors section"],
                ["État", equipement.etatLibelle],
                ["Alimentation", equipement.alimentation ?? "—"],
                ["Fiche mise à jour", <span key="m" className="tabular">{dateEtHeure(equipement.majLe)}</span>],
              ]}
            />
            {equipement.notes ? (
              <p className="text-small rounded-md bg-surface-sunk px-3 py-2">
                <b className="font-semibold">Notes : </b>
                {equipement.notes}
              </p>
            ) : null}
          </Panneau>
          <Panneau titre="Historique de maintenance" icone={Wrench} sousTitre={`${maintenances.length} intervention${maintenances.length > 1 ? "s" : ""} enregistrée${maintenances.length > 1 ? "s" : ""}`}>
            <TableauDonnees
              libelle={`Maintenances de ${equipement.code}`}
              colonnes={colonnesMaintenance}
              lignes={maintenances}
              cle={(e) => e.id}
              exportNom={`maintenances-${equipement.code}`}
              triInitial={{ cle: "date", sens: "desc" }}
              parPage={10}
              vide={{
                titre: "Aucune maintenance enregistrée",
                description: equipement.derniereMaintenanceLe ? `Dernière maintenance connue le ${dateCourte(equipement.derniereMaintenanceLe)}, antérieure au registre.` : "La première maintenance lancera le calendrier préventif.",
              }}
            />
          </Panneau>
          <AnomaliesLiees anomalies={dossier.anomalies} exportNom={`anomalies-${equipement.code}`} vide="Aucune anomalie terrain n'a été rattachée à cet équipement." />
        </div>
        <div className="grid content-start gap-5">
          <Panneau titre="Maintenance préventive" icone={CalendarClock}>
            <Fiche
              elements={[
                ["Périodicité", <span key="p" className="tabular">{equipement.periodiciteJours} jours</span>],
                ["Dernière maintenance", <span key="d" className="tabular">{dateCourte(equipement.derniereMaintenanceLe)}</span>],
                [
                  "Prochaine maintenance",
                  <span key="n" className="tabular">
                    {equipement.prochaineMaintenanceLe ? dateCourte(equipement.prochaineMaintenanceLe) : "À programmer"}
                    {equipement.maintenanceEnRetard ? " (dépassée)" : ""}
                  </span>,
                ],
              ]}
            />
          </Panneau>
          <PanneauChronologie evenements={dossier.chronologie} />
        </div>
      </div>

      {peutGerer ? (
        <>
          <FenetreEtatEquipement key={`e-${cleFenetre}`} open={mode === "etat"} onOpenChange={(o) => !o && setMode(null)} operation={operation} equipement={equipement} />
          <FenetreMaintenance key={`m-${cleFenetre}`} open={mode === "maintenance"} onOpenChange={(o) => !o && setMode(null)} operation={operation} equipement={equipement} />
        </>
      ) : null}
    </CadreInfra>
  )
}
