"use client"

import type { FunctionReturnType } from "convex/server"
import { FileSpreadsheet, ListPlus } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import {
  CelluleDouble,
  Indicateur,
  Indicateurs,
  TableauDonnees,
  suffixeDate,
  telechargerCsv,
  type ColonneTableau,
} from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte } from "@/components/gestion/referentiels/format"
import { libelleDirection } from "@/components/modules/ged/statuts"

import { CadreEtudes } from "./cadre"
import { FenetreConstat } from "./constat"
import { GRAVITES, STATUTS_CONSTAT, TagGravite, TagStatutConstat, type StatutConstat } from "./statuts"

type Plan = FunctionReturnType<typeof api.modules.etudes.queries.planActions>
type Ligne = Plan["lignes"][number]

const jour = (date: string) => dateCourte(Date.parse(`${date}T12:00:00Z`))

const colonnes: ColonneTableau<Ligne>[] = [
  {
    cle: "reference",
    libelle: "Réf.",
    rendu: (l) => <CelluleDouble mono haut={l.reference} bas={l.origine === "demo" ? "Exemple" : undefined} />,
    tri: (l) => l.reference,
  },
  {
    cle: "titre",
    libelle: "Action",
    rendu: (l) => <CelluleDouble haut={l.titre} bas={l.source ? `${l.source.numero} — ${l.source.titre}` : "Hors étude"} />,
    tri: (l) => l.titre,
    export: (l) => l.titre,
  },
  {
    cle: "gravite",
    libelle: "Gravité",
    rendu: (l) => <TagGravite gravite={l.gravite} />,
    tri: (l) => ["majeure", "moderee", "mineure"].indexOf(l.gravite),
    export: (l) => GRAVITES[l.gravite].libelle,
  },
  { cle: "direction", libelle: "Direction", rendu: (l) => libelleDirection(l.direction), tri: (l) => l.direction, secondaire: true },
  {
    cle: "responsable",
    libelle: "Responsable",
    rendu: (l) => (
      <>
        {l.responsable}
        {l.aMoi ? <small className="ml-1.5 font-semibold text-accent-ink">· vous</small> : null}
      </>
    ),
    tri: (l) => l.responsable,
    secondaire: true,
  },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (l) => (
      <span className={l.enRetard ? "font-semibold text-danger-ink" : undefined}>
        {l.enRetard ? "En retard · " : ""}
        <span className="tabular">{jour(l.echeance)}</span>
      </span>
    ),
    tri: (l) => l.echeance,
  },
  { cle: "avancement", libelle: "Avancement", rendu: (l) => <span className="tabular">{l.avancement} %</span>, tri: (l) => l.avancement, numerique: true },
  {
    cle: "statut",
    libelle: "État",
    rendu: (l) => <TagStatutConstat statut={l.statut} />,
    tri: (l) => Object.keys(STATUTS_CONSTAT).indexOf(l.statut),
    export: (l) => STATUTS_CONSTAT[l.statut].libelle,
  },
]

/** Plan d'actions d'audit : constats, recommandations, responsables, échéances. */
export function PlanActions() {
  const plan = useQuery(api.modules.etudes.queries.planActions, {})
  const [statut, setStatut] = useState("ouvertes")
  const [gravite, setGravite] = useState("toutes")
  const [nouveau, setNouveau] = useState(false)
  const lignes = plan?.lignes.filter(
    (ligne) =>
      (statut === "toutes" ||
        (statut === "ouvertes" ? ["a_lancer", "en_cours", "realisee"].includes(ligne.statut) : statut === "retard" ? ligne.enRetard : statut === "miennes" ? ligne.aMoi : ligne.statut === statut)) &&
      (gravite === "toutes" || ligne.gravite === gravite)
  )
  const ouvertes = plan?.lignes.filter((ligne) => ["a_lancer", "en_cours", "realisee"].includes(ligne.statut)) ?? []

  return (
    <CadreEtudes
      titre="Plan d'actions d'audit"
      description="Constats, recommandations, responsables et échéances. Le responsable fait avancer l'action ; l'audit la vérifie, jamais celui qui l'a réalisée."
      actions={
        plan?.droits.peutGererPlan ? (
          <Button type="button" onClick={() => setNouveau(true)}>
            <ListPlus />
            Inscrire un constat
          </Button>
        ) : null
      }
    >
      {plan ? (
        <Indicateurs colonnes={4}>
          <Indicateur libelle="Actions ouvertes" valeur={ouvertes.length} />
          <Indicateur
            libelle="En retard"
            valeur={plan.lignes.filter((ligne) => ligne.enRetard).length}
            evolution={{ sens: plan.lignes.some((ligne) => ligne.enRetard) ? "baisse" : "neutre", texte: "Échéance dépassée" }}
          />
          <Indicateur libelle="Majeures ouvertes" valeur={ouvertes.filter((ligne) => ligne.gravite === "majeure").length} />
          <Indicateur
            libelle="Vérifiées"
            valeur={plan.lignes.filter((ligne) => ligne.statut === "verifiee").length}
            unite={`sur ${plan.lignes.length}`}
            remplissage={plan.lignes.length ? plan.lignes.filter((ligne) => ligne.statut === "verifiee").length / plan.lignes.length : undefined}
          />
        </Indicateurs>
      ) : null}
      <TableauDonnees
        libelle="Plan d'actions d'audit"
        colonnes={colonnes}
        lignes={lignes}
        cle={(ligne) => ligne._id}
        lien={(ligne) => `/etudes/plan-actions/${ligne._id}`}
        recherche={{
          placeholder: "Référence, titre, constat, responsable…",
          texte: (ligne) => `${ligne.reference} ${ligne.titre} ${ligne.constat} ${ligne.recommandation} ${ligne.responsable}`,
        }}
        filtres={
          <>
            <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
              <option value="ouvertes">Ouvertes</option>
              <option value="retard">En retard</option>
              <option value="miennes">Dont je suis responsable</option>
              <option value="toutes">Toutes</option>
              {(Object.keys(STATUTS_CONSTAT) as StatutConstat[]).map((cle) => (
                <option key={cle} value={cle}>
                  {STATUTS_CONSTAT[cle].libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Gravité" value={gravite} onChange={setGravite}>
              <option value="toutes">Toutes gravités</option>
              {Object.entries(GRAVITES).map(([cle, definition]) => (
                <option key={cle} value={cle}>
                  {definition.libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        outils={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!lignes || lignes.length === 0}
            onClick={() =>
              lignes &&
              telechargerCsv(
                `plan-actions-audit-detail-${suffixeDate()}`,
                [
                  { libelle: "Référence", valeur: (l: Ligne) => l.reference },
                  { libelle: "Titre", valeur: (l: Ligne) => l.titre },
                  { libelle: "Constat", valeur: (l: Ligne) => l.constat },
                  { libelle: "Recommandation", valeur: (l: Ligne) => l.recommandation },
                  { libelle: "Gravité", valeur: (l: Ligne) => GRAVITES[l.gravite].libelle },
                  { libelle: "Direction", valeur: (l: Ligne) => libelleDirection(l.direction) },
                  { libelle: "Responsable", valeur: (l: Ligne) => l.responsable },
                  { libelle: "Échéance", valeur: (l: Ligne) => l.echeance },
                  { libelle: "Avancement (%)", valeur: (l: Ligne) => l.avancement },
                  { libelle: "État", valeur: (l: Ligne) => STATUTS_CONSTAT[l.statut].libelle },
                  { libelle: "En retard", valeur: (l: Ligne) => l.enRetard },
                  { libelle: "Source", valeur: (l: Ligne) => (l.source ? `${l.source.numero} — ${l.source.titre}` : "") },
                  { libelle: "Inscrit par", valeur: (l: Ligne) => l.creePar },
                  { libelle: "Inscrit le", valeur: (l: Ligne) => new Date(l.createdAt) },
                ],
                lignes
              )
            }
          >
            <FileSpreadsheet />
            Exporter le détail
          </Button>
        }
        exportNom="plan-actions-audit"
        imprimable
        triInitial={{ cle: "echeance", sens: "asc" }}
        vide={{ titre: "Aucune action", description: "Aucune action ne correspond à ces filtres." }}
      />
      {nouveau ? <FenetreConstat open onOpenChange={setNouveau} /> : null}
    </CadreEtudes>
  )
}
