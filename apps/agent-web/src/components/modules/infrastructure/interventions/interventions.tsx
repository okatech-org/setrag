"use client"

import { Ban, CalendarClock, CalendarPlus, CalendarRange, Clock, Construction, Filter, Map as IconeCarte } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, heure, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { CadreInfra, TagEtat, infraApi, plagePk, useDroitsInfra, type LigneIntervention } from "../commun"
import { SchemaVoie, type ZoneVoie } from "../schema-voie"
import { FenetreDemandeIntervention } from "./formulaire"
import { STATUTS_INTERVENTION, TYPES_INTERVENTION, regime } from "./libelles"
import { dateEtHeure, useGaresLigne, useMaintenant } from "./partage"

const JOUR = 86_400_000

/** Coupure de voie ou travaux sous circulation : toujours écrit. */
export function TagRegime({ interruption }: { interruption: boolean }) {
  return interruption ? (
    <Pastille ton="danger" icone={Ban}>
      Coupure de voie
    </Pastille>
  ) : (
    <Pastille ton="info" icone={Construction}>
      Sous circulation
    </Pastille>
  )
}

/** Date et heure sur deux lignes, en chiffres alignés. */
function Moment({ valeur }: { valeur: number }) {
  return (
    <span className="tabular grid text-[13.5px] whitespace-nowrap">
      <span>{dateCourte(valeur)}</span>
      <span className="text-ink-muted">{heure(valeur)}</span>
    </span>
  )
}

const ORDRE_STATUTS = ["en_cours", "accordee", "demandee", "terminee", "refusee", "annulee"]

export const colonnesInterventions: ColonneTableau<LigneIntervention>[] = [
  { cle: "numero", libelle: "N°", rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>, tri: (i) => i.numero },
  { cle: "libelle", libelle: "Travaux", rendu: (i) => <CelluleDouble haut={i.libelle} bas={i.typeLibelle} />, tri: (i) => i.libelle },
  { cle: "type", libelle: "Type", rendu: (i) => i.typeLibelle, tri: (i) => i.typeLibelle, secondaire: true },
  { cle: "plage", libelle: "Plage PK", rendu: (i) => <span className="tabular whitespace-nowrap">{plagePk(i.pkDebut, i.pkFin)}</span>, tri: (i) => i.pkDebut, export: (i) => plagePk(i.pkDebut, i.pkFin) },
  { cle: "debut", libelle: "Début", rendu: (i) => <Moment valeur={i.debutLe} />, tri: (i) => i.debutLe, export: (i) => dateEtHeure(i.debutLe) },
  { cle: "fin", libelle: "Fin", rendu: (i) => <Moment valeur={i.finLe} />, tri: (i) => i.finLe, export: (i) => dateEtHeure(i.finLe) },
  { cle: "regime", libelle: "Circulation", rendu: (i) => <TagRegime interruption={i.interruption} />, tri: (i) => (i.interruption ? 0 : 1), export: (i) => regime(i.interruption) },
  { cle: "equipe", libelle: "Équipe", rendu: (i) => i.equipe, tri: (i) => i.equipe, secondaire: true },
  { cle: "statut", libelle: "Statut", rendu: (i) => <TagEtat valeur={i.statut} libelle={i.statutLibelle} />, tri: (i) => ORDRE_STATUTS.indexOf(i.statut), export: (i) => i.statutLibelle },
  {
    cle: "lien",
    libelle: "Chantier · anomalie",
    rendu: (i) => <span className="tabular text-[13px]">{[i.chantierCode, i.anomalieNumero].filter(Boolean).join(" · ") || "—"}</span>,
    tri: (i) => i.chantierCode ?? i.anomalieNumero,
    export: (i) => [i.chantierCode, i.anomalieNumero].filter(Boolean).join(" · "),
    secondaire: true,
  },
]

type Periode = "defaut" | "aujourdhui" | "semaine" | "a_venir" | "passees" | "toutes"

const PERIODES: Record<Periode, string> = {
  defaut: "14 prochains jours et passées",
  aujourdhui: "Aujourd'hui",
  semaine: "7 prochains jours",
  a_venir: "En cours et à venir (14 jours)",
  passees: "Passées",
  toutes: "Toutes les plages",
}

function dansPeriode(i: LigneIntervention, periode: Periode, maintenant: number) {
  switch (periode) {
    case "defaut":
      return i.debutLe < maintenant + 14 * JOUR
    case "aujourdhui":
      return i.aujourdHui
    case "semaine":
      return i.finLe > maintenant && i.debutLe < maintenant + 7 * JOUR
    case "a_venir":
      return i.finLe > maintenant && i.debutLe < maintenant + 14 * JOUR
    case "passees":
      return i.finLe <= maintenant
    case "toutes":
      return true
  }
}

/** Plages accordées ou en cours de la semaine → zones « travaux » du schéma. */
export function zonesTravaux(interventions: readonly LigneIntervention[], maintenant: number): ZoneVoie[] {
  return interventions
    .filter((i) => (i.statut === "accordee" || i.statut === "en_cours") && i.finLe > maintenant && i.debutLe < maintenant + 7 * JOUR)
    .sort((a, b) => a.pkDebut - b.pkDebut)
    .map((i) => ({
      id: i.id,
      libelle: i.numero,
      pkDebut: i.pkDebut,
      pkFin: i.pkFin,
      detail: `${regime(i.interruption)} · ${dateEtHeure(i.debutLe)} → ${dateEtHeure(i.finLe)}`,
      href: `/infrastructures/interventions/${i.id}`,
      nature: "travaux" as const,
    }))
}

export function InterventionsEcran() {
  const router = useRouter()
  const droits = useDroitsInfra()
  const maintenant = useMaintenant()
  const interventions = useQuery(infraApi.queries.interventions, {})
  const gares = useGaresLigne()
  const operation = useOperation()
  const [statut, setStatut] = useState("tous")
  const [type, setType] = useState("tous")
  const [periode, setPeriode] = useState<Periode>("defaut")
  const [demande, setDemande] = useState(false)
  const [cleFenetre, setCleFenetre] = useState(0)

  const filtrees = interventions?.filter(
    (i) =>
      (statut === "tous" || (statut === "actives" ? ["demandee", "accordee", "en_cours"].includes(i.statut) : i.statut === statut)) &&
      (type === "tous" || i.type === type) &&
      dansPeriode(i, periode, maintenant)
  )
  const charge = interventions !== undefined
  const aujourdhui = interventions?.filter((i) => i.aujourdHui && (i.statut === "accordee" || i.statut === "en_cours")) ?? []
  const enAttente = interventions?.filter((i) => i.statut === "demandee").length ?? 0
  const coupuresSemaine = interventions?.filter((i) => i.interruption && (i.statut === "accordee" || i.statut === "en_cours") && i.finLe > maintenant && i.debutLe < maintenant + 7 * JOUR).length ?? 0
  const enCours = interventions?.filter((i) => i.statut === "en_cours").length ?? 0
  const zones = interventions ? zonesTravaux(interventions, maintenant) : []

  return (
    <CadreInfra
      titre="Plages travaux"
      description="Demandes, accords et suivi des interventions sur la voie. Une coupure de voie arrête la circulation sur sa plage PK pendant son créneau."
      actions={
        droits.peut("intervention_demander") ? (
          <Button
            type="button"
            onClick={() => {
              setCleFenetre((c) => c + 1)
              setDemande(true)
            }}
          >
            <CalendarPlus />
            Demander une plage travaux
          </Button>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      <Indicateurs>
        <Indicateur libelle="Travaux en cours" icone={Construction} valeur={charge ? nombre(enCours) : "…"} evolution={charge ? { sens: "neutre", texte: `${aujourdhui.length} plage${aujourdhui.length > 1 ? "s" : ""} accordée${aujourdhui.length > 1 ? "s" : ""} aujourd'hui` } : undefined} />
        <Indicateur libelle="Demandes à accorder" icone={Clock} valeur={charge ? nombre(enAttente) : "…"} evolution={enAttente > 0 ? { sens: "vigilance", texte: "En attente de décision" } : undefined} />
        <Indicateur libelle="Coupures de voie sur 7 jours" icone={Ban} valeur={charge ? nombre(coupuresSemaine) : "…"} />
        <Indicateur libelle="Plages au registre" icone={CalendarRange} valeur={charge ? nombre(interventions.length) : "…"} />
      </Indicateurs>

      <Panneau titre="Travaux accordés sur la ligne, 7 prochains jours" icone={IconeCarte} sousTitre="Chaque zone est écrite sous le schéma et ouvre son dossier">
        {gares === undefined || interventions === undefined ? (
          <p role="status" className="text-small text-ink-muted">
            Chargement de la ligne…
          </p>
        ) : (
          <SchemaVoie gares={gares} zones={zones} />
        )}
      </Panneau>

      <TableauDonnees
        libelle="Plages travaux"
        colonnes={colonnesInterventions}
        lignes={filtrees}
        cle={(i) => i.id}
        lien={(i) => `/infrastructures/interventions/${i.id}`}
        recherche={{ placeholder: "Numéro, travaux, équipe, chantier…", texte: (i) => `${i.numero} ${i.libelle} ${i.equipe} ${i.chantierCode ?? ""} ${i.anomalieNumero ?? ""} ${i.demandeurNom ?? ""}` }}
        filtres={
          <>
            <SelectFiltre libelle="Période" icone={CalendarClock} value={periode} onChange={(v) => setPeriode(v as Periode)}>
              {Object.entries(PERIODES).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Statut" icone={Filter} value={statut} onChange={setStatut}>
              <option value="tous">Tous les statuts</option>
              <option value="actives">Demandées, accordées ou en cours</option>
              {Object.entries(STATUTS_INTERVENTION).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Type de travaux" icone={Construction} value={type} onChange={setType}>
              <option value="tous">Tous les types</option>
              {Object.entries(TYPES_INTERVENTION).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        exportNom="plages-travaux"
        triInitial={{ cle: "debut", sens: "desc" }}
        vide={{
          titre: interventions && interventions.length > 0 ? "Aucune plage pour ces filtres" : "Aucune plage travaux au registre",
          description: interventions && interventions.length > 0 ? `Période : ${PERIODES[periode].toLowerCase()}. Élargissez la période ou le statut.` : "Les demandes de plages travaux apparaîtront ici.",
          action:
            periode !== "toutes" && interventions && interventions.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setPeriode("toutes")}>
                Voir toutes les plages
              </Button>
            ) : undefined,
        }}
      />
      {droits.peut("intervention_demander") ? (
        <FenetreDemandeIntervention
          key={cleFenetre}
          open={demande}
          onOpenChange={setDemande}
          operation={operation}
          onCree={(id) => router.push(`/infrastructures/interventions/${id}` as Route)}
        />
      ) : null}
    </CadreInfra>
  )
}
