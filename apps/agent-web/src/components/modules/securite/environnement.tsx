"use client"

import type { FunctionReturnType } from "convex/server"
import {
  CalendarPlus,
  Flame,
  Leaf,
  ListChecks,
  PawPrint,
  TreePine,
  Droplets,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import {
  CelluleDouble,
  Indicateur,
  Indicateurs,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { nombre } from "@/components/gestion/referentiels/format"
import {
  AccesRestreint,
  Chargement,
  dateIso,
} from "@/components/modules/rh/commun"

import {
  Avancement,
  CadreSecurite,
  TagAction,
  TagEvenement,
  TagGravite,
  TagInspection,
  TagResultat,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueProgrammer } from "./inspections"
import {
  GRAVITES,
  RANG_GRAVITE,
  RESULTATS_INSPECTION,
  STATUTS_ACTION,
  STATUTS_EVENEMENT,
  STATUTS_INSPECTION,
  TYPES_INSPECTION,
  libelleType,
  lieuEtPk,
} from "./libelles"

type Environnement = FunctionReturnType<
  typeof api.modules.securite.accueil.environnement
>
type EvenementEnv = Environnement["evenements"][number]
type InspectionEnv = Environnement["inspections"][number]
type ActionEnv = Environnement["actions"][number]

const colonnesEvenements: ColonneTableau<EvenementEnv>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (e) => <span className="tabular font-semibold">{e.numero}</span>,
    tri: (e) => e.numero,
  },
  {
    cle: "date",
    libelle: "Survenu le",
    rendu: (e) => (
      <span className="tabular whitespace-nowrap">
        {dateHeureComplete(e.survenuLe)}
      </span>
    ),
    tri: (e) => e.survenuLe,
    export: (e) => dateHeureComplete(e.survenuLe),
  },
  {
    cle: "type",
    libelle: "Type",
    rendu: (e) => libelleType(e.type),
    tri: (e) => libelleType(e.type),
  },
  {
    cle: "gravite",
    libelle: "Gravité",
    rendu: (e) => <TagGravite gravite={e.gravite} />,
    tri: (e) => RANG_GRAVITE[e.gravite],
    export: (e) => GRAVITES[e.gravite],
  },
  {
    cle: "lieu",
    libelle: "Lieu / PK",
    rendu: (e) => (
      <CelluleDouble
        haut={lieuEtPk(e)}
        bas={e.zoneLope ? "Parc national de la Lopé" : "Hors du parc"}
      />
    ),
    tri: (e) => e.pk ?? e.lieu,
    export: (e) => `${lieuEtPk(e)}${e.zoneLope ? " (Lopé)" : ""}`,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (e) => <TagEvenement statut={e.statut} />,
    tri: (e) => e.statut,
    export: (e) => STATUTS_EVENEMENT[e.statut],
  },
]

const colonnesInspections: ColonneTableau<InspectionEnv>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>,
    tri: (i) => i.numero,
  },
  {
    cle: "objet",
    libelle: "Inspection",
    rendu: (i) => (
      <CelluleDouble haut={i.objet} bas={TYPES_INSPECTION[i.type]} />
    ),
    tri: (i) => i.objet,
    export: (i) => `${TYPES_INSPECTION[i.type]} — ${i.objet}`,
  },
  {
    cle: "lieu",
    libelle: "Lieu",
    rendu: (i) => lieuEtPk(i),
    tri: (i) => i.pk ?? i.lieu,
    export: (i) => lieuEtPk(i),
    secondaire: true,
  },
  {
    cle: "date",
    libelle: "Date",
    rendu: (i) => <span className="tabular">{dateIso(i.dateProgrammee)}</span>,
    tri: (i) => i.dateProgrammee,
  },
  {
    cle: "resultat",
    libelle: "Résultat",
    rendu: (i) =>
      i.resultat ? (
        <TagResultat resultat={i.resultat} />
      ) : (
        <span className="text-ink-muted">—</span>
      ),
    tri: (i) => i.resultat ?? "",
    export: (i) => (i.resultat ? RESULTATS_INSPECTION[i.resultat] : ""),
  },
  {
    cle: "nc",
    libelle: "Non-conformités",
    rendu: (i) => i.nonConformites,
    tri: (i) => i.nonConformites,
    numerique: true,
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (i) => <TagInspection statut={i.statut} />,
    tri: (i) => i.statut,
    export: (i) => STATUTS_INSPECTION[i.statut],
  },
]

const colonnesActionsEnv: ColonneTableau<ActionEnv>[] = [
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
  {
    cle: "responsable",
    libelle: "Responsable",
    rendu: (a) => a.responsableNom,
    tri: (a) => a.responsableNom,
    secondaire: true,
  },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (a) => (
      <span className="flex flex-wrap items-center gap-1">
        <span className="tabular whitespace-nowrap">{dateIso(a.echeance)}</span>
        {a.enRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (a) => a.echeance,
    export: (a) => `${a.echeance}${a.enRetard ? " (en retard)" : ""}`,
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

/** Suivi environnemental : traversée du parc national de la Lopé (PK 240 — 315). */
export function SuiviEnvironnement() {
  const router = useRouter()
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("environnement.lire")
  const donnees = useQuery(
    api.modules.securite.accueil.environnement,
    lecture ? {} : "skip"
  )
  const [programmer, setProgrammer] = useState(false)
  const registre = peut("registre.lire")

  return (
    <CadreSecurite
      titre="Environnement · parc national de la Lopé"
      description="Événements, inspections et actions qui touchent la traversée du parc de la Lopé et l'environnement de la ligne : faune, feux de brousse, pollutions."
      actions={
        peut("inspections.gerer") ? (
          <Button type="button" onClick={() => setProgrammer(true)}>
            <CalendarPlus />
            Programmer une inspection environnementale
          </Button>
        ) : null
      }
    >
      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas le suivi environnemental.
        </AccesRestreint>
      ) : donnees === undefined ? (
        <Chargement libelle="Chargement du suivi environnemental" />
      ) : (
        <>
          <p className="text-small text-ink-muted">
            Zone suivie : PK{" "}
            <span className="tabular">{donnees.zone.pkMin}</span> à{" "}
            <span className="tabular">{donnees.zone.pkMax}</span> (Bissouma —
            Offoué), sur douze mois glissants.
          </p>
          <Indicateurs colonnes={3}>
            <Indicateur
              libelle="Événements dans le parc"
              icone={TreePine}
              valeur={nombre(donnees.indicateurs.evenementsZone)}
            />
            <Indicateur
              libelle="Heurts de faune"
              icone={PawPrint}
              valeur={nombre(donnees.indicateurs.heurtsFaune)}
              evolution={{ sens: "neutre", texte: "Sur toute la ligne" }}
            />
            <Indicateur
              libelle="Feux de brousse"
              icone={Flame}
              valeur={nombre(donnees.indicateurs.feux)}
            />
            <Indicateur
              libelle="Atteintes à l'environnement"
              icone={Droplets}
              valeur={nombre(donnees.indicateurs.pollutions)}
            />
            <Indicateur
              libelle="Actions environnementales ouvertes"
              icone={ListChecks}
              valeur={nombre(donnees.indicateurs.actionsOuvertes)}
              evolution={
                donnees.indicateurs.actionsEnRetard > 0
                  ? {
                      sens: "baisse",
                      texte: `${donnees.indicateurs.actionsEnRetard} en retard`,
                    }
                  : { sens: "neutre", texte: "Aucune en retard" }
              }
            />
            <Indicateur
              libelle="Inspections environnementales"
              icone={Leaf}
              valeur={nombre(donnees.inspections.length)}
            />
          </Indicateurs>

          <Panneau
            titre="Événements environnementaux et de la zone"
            icone={TreePine}
          >
            <TableauDonnees
              libelle="Événements environnementaux"
              colonnes={colonnesEvenements}
              lignes={donnees.evenements}
              cle={(e) => e._id}
              lien={
                registre ? (e) => `/securite/evenements/${e._id}` : undefined
              }
              recherche={{
                placeholder: "N°, type, lieu…",
                texte: (e) => `${e.numero} ${libelleType(e.type)} ${e.lieu}`,
              }}
              exportNom="environnement-evenements"
              triInitial={{ cle: "date", sens: "desc" }}
              vide={{
                titre: "Aucun événement",
                description:
                  "Aucun événement environnemental ni dans le parc sur douze mois.",
              }}
            />
          </Panneau>

          <Panneau titre="Inspections environnementales" icone={Leaf}>
            <TableauDonnees
              libelle="Inspections environnementales"
              colonnes={colonnesInspections}
              lignes={donnees.inspections}
              cle={(i) => i._id}
              lien={(i) => `/securite/inspections/${i._id}`}
              exportNom="environnement-inspections"
              triInitial={{ cle: "date", sens: "desc" }}
              vide={{
                titre: "Aucune inspection",
                description:
                  "Aucune inspection environnementale n'est programmée.",
              }}
            />
          </Panneau>

          <Panneau
            titre="Actions correctives environnementales"
            icone={ListChecks}
          >
            <TableauDonnees
              libelle="Actions environnementales"
              colonnes={colonnesActionsEnv}
              lignes={donnees.actions}
              cle={(a) => a._id}
              lien={registre ? (a) => `/securite/actions/${a._id}` : undefined}
              exportNom="environnement-actions"
              triInitial={{ cle: "echeance", sens: "asc" }}
              vide={{
                titre: "Aucune action",
                description: "Aucune action corrective environnementale.",
              }}
            />
          </Panneau>
        </>
      )}
      {peut("inspections.gerer") ? (
        <DialogueProgrammer
          open={programmer}
          onOpenChange={setProgrammer}
          typeInitial="inspection_environnementale"
          onProgrammee={(id) => router.push(`/securite/inspections/${id}`)}
        />
      ) : null}
    </CadreSecurite>
  )
}
