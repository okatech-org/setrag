"use client"

import { CalendarCheck, CalendarClock, ListChecks, Plus, TrainFront } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Voie } from "@workspace/ui/components/voie"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"
import { TagActif } from "@/components/gestion/referentiels/statuts"

import {
  CadreGmao,
  ETATS_ECHEANCE,
  FAMILLES,
  gmaoApi,
  km,
  libelleRestant,
  STATUTS_OT,
  TagEcheance,
  TagOt,
  useDroitsGmao,
  type LigneEcheance,
  type LignePlan,
} from "../commun"
import { LienCellule } from "../parc/partage"
import { DialogueCreationPlan } from "./formulaires-plan"

/* ============================================================ Formats */

export const seuilsPlan = (plan: { seuilKm: number | null; seuilJours: number | null }) =>
  [plan.seuilKm ? km(plan.seuilKm) : null, plan.seuilJours ? `${nombre(plan.seuilJours)} j` : null].filter(Boolean).join(" ou ") || "—"

export const seriesPlan = (series: readonly string[]) => (series.length === 0 ? "Toute la famille" : series.join(", "))

/** Résultat d'une génération d'OT préventifs, avec un lien vers chaque OT créé. */
export function ResultatGeneration({
  resultat,
}: {
  resultat: { crees: readonly { otId: string; numero: string }[]; ignores: number } | null
}) {
  if (!resultat) return null
  return (
    <InlineMessage
      tone={resultat.crees.length > 0 ? "success" : "warning"}
      title={`${resultat.crees.length} OT préventif(s) ouvert(s) · ${resultat.ignores} échéance(s) ignorée(s)`}
    >
      {resultat.crees.length > 0 ? (
        <span className="flex flex-wrap gap-x-3">
          {resultat.crees.map((ot) => (
            <LienCellule key={ot.otId} href={`/materiel/ordres/${ot.otId}`} mono>
              {ot.numero}
            </LienCellule>
          ))}
        </span>
      ) : (
        "Les échéances choisies ont déjà un OT ouvert, ou leur plan est désactivé."
      )}
      {resultat.crees.length > 0 && resultat.ignores > 0 ? " Les échéances ignorées avaient déjà un OT ouvert." : null}
    </InlineMessage>
  )
}

/* ============================================================ Échéances */

const RANG_ECHEANCE = { echue: 0, proche: 1, a_jour: 2 } as const

function CaseSelection({ libelle, coche, desactive, onChange }: { libelle: string; coche: boolean; desactive?: boolean; onChange: (coche: boolean) => void }) {
  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <span className="sr-only">{libelle}</span>
      <input
        type="checkbox"
        checked={coche}
        disabled={desactive}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 cursor-pointer accent-accent-base disabled:cursor-not-allowed"
      />
    </label>
  )
}

function colonnesEcheances(selection: Set<string>, basculer: (id: string, coche: boolean) => void): ColonneTableau<LigneEcheance>[] {
  return [
    {
      cle: "choix",
      libelle: "Choix",
      rendu: (e) =>
        e.ot ? (
          <span className="sr-only">OT déjà ouvert</span>
        ) : (
          <CaseSelection
            libelle={`Sélectionner ${e.planCode} pour ${e.numero}`}
            coche={selection.has(e.planEquipementId)}
            onChange={(coche) => basculer(e.planEquipementId, coche)}
          />
        ),
      export: false,
    },
    {
      cle: "engin",
      libelle: "Engin",
      rendu: (e) => (
        <span className="grid">
          <LienCellule href={`/materiel/parc/${e.equipementId}`} mono>
            {e.numero}
          </LienCellule>
          <small className="text-[12.5px] text-ink-muted">
            {FAMILLES[e.famille]} · {e.serie}
          </small>
        </span>
      ),
      tri: (e) => e.numero,
    },
    {
      cle: "plan",
      libelle: "Plan",
      rendu: (e) => (
        <span className="grid">
          <LienCellule href={`/materiel/preventif/${e.planId}`} mono>
            {e.planCode}
          </LienCellule>
          <small className="text-[12.5px] text-ink-muted">{e.planLibelle}</small>
        </span>
      ),
      tri: (e) => e.planCode,
      export: (e) => `${e.planCode} — ${e.planLibelle}`,
    },
    {
      cle: "etat",
      libelle: "État",
      rendu: (e) => (
        <span className="grid min-w-[140px] gap-1">
          <TagEcheance etat={e.etat} />
          <span className="flex items-center gap-2">
            <Voie rempli={Math.min(1, e.ratio)} />
            <span className="tabular text-[12.5px] text-ink-muted">{Math.round(e.ratio * 100)} %</span>
          </span>
        </span>
      ),
      tri: (e) => RANG_ECHEANCE[e.etat] * 10 - e.ratio,
      export: (e) => `${ETATS_ECHEANCE[e.etat].libelle} (${Math.round(e.ratio * 100)} %)`,
    },
    {
      cle: "restant",
      libelle: "Restant",
      rendu: (e) => (
        <CelluleDouble
          haut={<span className="tabular">{libelleRestant(e)}</span>}
          bas={e.declencheur === "km" ? "Seuil kilométrique" : "Seuil calendaire"}
        />
      ),
      tri: (e) => -e.ratio,
      export: (e) => libelleRestant(e),
    },
    {
      cle: "date",
      libelle: "Échéance calendaire",
      rendu: (e) => <span className="tabular">{dateCourte(e.prochaineDate)}</span>,
      tri: (e) => e.prochaineDate ?? Number.MAX_SAFE_INTEGER,
      secondaire: true,
    },
    {
      cle: "ot",
      libelle: "OT",
      rendu: (e) =>
        e.ot ? (
          <span className="grid justify-items-start gap-1">
            <LienCellule href={`/materiel/ordres/${e.ot.id}`} mono>
              {e.ot.numero}
            </LienCellule>
            <TagOt statut={e.ot.statut} />
          </span>
        ) : (
          <span className="text-ink-muted">Aucun OT</span>
        ),
      tri: (e) => e.ot?.numero ?? "",
      export: (e) => (e.ot ? `${e.ot.numero} — ${STATUTS_OT[e.ot.statut].libelle}` : "Aucun OT"),
    },
  ]
}

function OngletEcheances({ peutGenerer }: { peutGenerer: boolean }) {
  const echeances = useQuery(gmaoApi.queries.echeances, {})
  const generer = useMutation(gmaoApi.mutations.genererOtPreventifs)
  const operation = useOperation()
  const [etat, setEtat] = useState("toutes")
  const [famille, setFamille] = useState("toutes")
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [resultat, setResultat] = useState<{ crees: { otId: string; numero: string }[]; ignores: number } | null>(null)

  const filtrees = echeances?.filter(
    (e) =>
      (etat === "toutes" || (etat === "sans_ot" ? e.ot === null : e.etat === etat)) &&
      (famille === "toutes" || e.famille === famille)
  )
  const selectionnables = (filtrees ?? []).filter((e) => e.ot === null)
  // Une échéance traitée entre-temps (OT ouvert ailleurs) sort de la sélection.
  const choisies = (echeances ?? []).filter((e) => e.ot === null && selection.has(e.planEquipementId)).map((e) => e.planEquipementId)

  const basculer = (id: string, coche: boolean) =>
    setSelection((actuelle) => {
      const suivante = new Set(actuelle)
      if (coche) suivante.add(id)
      else suivante.delete(id)
      return suivante
    })

  const lancer = async () => {
    setResultat(null)
    const retour = await operation.executer("generer", () => generer({ planEquipementIds: choisies as never[] }))
    if (retour) {
      setResultat({ crees: retour.crees.map((ot) => ({ otId: ot.otId, numero: ot.numero })), ignores: retour.ignores })
      setSelection(new Set())
    }
  }

  return (
    <div className="grid gap-4">
      {echeances ? (
        <Indicateurs colonnes={3}>
          <Indicateur libelle="Échéances échues" icone={CalendarClock} valeur={nombre(echeances.filter((e) => e.etat === "echue").length)} />
          <Indicateur libelle="Échéances proches" icone={CalendarCheck} valeur={nombre(echeances.filter((e) => e.etat === "proche").length)} />
          <Indicateur
            libelle="Sans OT ouvert"
            icone={ListChecks}
            valeur={nombre(echeances.filter((e) => e.ot === null).length)}
            evolution={{ sens: "neutre", texte: "À transformer en ordres de travail" }}
          />
        </Indicateurs>
      ) : null}
      <RetourOperation retour={operation.retour} />
      <ResultatGeneration resultat={resultat} />
      <TableauDonnees
        libelle="Échéances préventives échues et proches"
        colonnes={colonnesEcheances(selection, basculer).filter((colonne) => peutGenerer || colonne.cle !== "choix")}
        lignes={filtrees}
        cle={(e) => e.planEquipementId}
        recherche={{ placeholder: "Engin, série, plan…", texte: (e) => `${e.numero} ${e.serie} ${e.planCode} ${e.planLibelle} ${e.ot?.numero ?? ""}` }}
        filtres={
          <>
            <SelectFiltre libelle="État de l'échéance" value={etat} onChange={setEtat}>
              <option value="toutes">Échues et proches</option>
              <option value="echue">Échues</option>
              <option value="proche">Proches</option>
              <option value="sans_ot">Sans OT ouvert</option>
            </SelectFiltre>
            <SelectFiltre libelle="Famille" icone={TrainFront} value={famille} onChange={setFamille}>
              <option value="toutes">Toutes les familles</option>
              {Object.entries(FAMILLES).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        outils={
          peutGenerer ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={selectionnables.length === 0}
                onClick={() =>
                  setSelection((actuelle) =>
                    choisies.length > 0 && selectionnables.every((e) => actuelle.has(e.planEquipementId))
                      ? new Set()
                      : new Set([...actuelle, ...selectionnables.map((e) => e.planEquipementId)])
                  )
                }
              >
                {choisies.length > 0 && selectionnables.every((e) => selection.has(e.planEquipementId))
                  ? "Tout désélectionner"
                  : `Sélectionner les échéances sans OT (${selectionnables.length})`}
              </Button>
              <Button type="button" size="sm" disabled={choisies.length === 0} loading={operation.enCours === "generer"} onClick={() => void lancer()}>
                <Plus />
                Ouvrir les OT des échéances sélectionnées ({choisies.length})
              </Button>
            </>
          ) : null
        }
        exportNom="echeances-preventives"
        triInitial={{ cle: "etat", sens: "asc" }}
        vide={{
          titre: echeances && echeances.length > 0 ? "Aucune échéance pour ces filtres" : "Aucune échéance à traiter",
          description:
            echeances && echeances.length > 0
              ? "Élargissez l'état ou la famille."
              : "Tous les engins rattachés à un plan actif sont à jour de leur préventif.",
        }}
      />
    </div>
  )
}

/* =============================================================== Plans */

const colonnesPlans: ColonneTableau<LignePlan>[] = [
  { cle: "code", libelle: "Code", rendu: (p) => <span className="tabular font-semibold">{p.code}</span>, tri: (p) => p.code },
  { cle: "libelle", libelle: "Libellé", rendu: (p) => <span className="font-semibold">{p.libelle}</span>, tri: (p) => p.libelle },
  { cle: "series", libelle: "Séries", rendu: (p) => seriesPlan(p.series), tri: (p) => seriesPlan(p.series), secondaire: true },
  { cle: "famille", libelle: "Famille", rendu: (p) => FAMILLES[p.famille], tri: (p) => FAMILLES[p.famille] },
  { cle: "seuils", libelle: "Intervalle", rendu: (p) => <span className="tabular">{seuilsPlan(p)}</span>, tri: (p) => p.seuilKm ?? p.seuilJours ?? 0, export: (p) => seuilsPlan(p) },
  { cle: "duree", libelle: "Durée", rendu: (p) => <span className="tabular">{p.dureeHeures.toLocaleString("fr-FR")} h</span>, tri: (p) => p.dureeHeures, numerique: true, secondaire: true },
  { cle: "immobilisant", libelle: "Immobilisant", rendu: (p) => (p.immobilisant ? "Oui" : "Non"), tri: (p) => (p.immobilisant ? "oui" : "non"), secondaire: true },
  { cle: "engins", libelle: "Engins", rendu: (p) => <span className="tabular">{nombre(p.engins)}</span>, tri: (p) => p.engins, numerique: true },
  {
    cle: "echues",
    libelle: "Échues",
    rendu: (p) => <span className={p.echues > 0 ? "tabular font-bold text-danger-ink" : "tabular"}>{nombre(p.echues)}</span>,
    tri: (p) => p.echues,
    numerique: true,
  },
  { cle: "proches", libelle: "Proches", rendu: (p) => <span className="tabular">{nombre(p.proches)}</span>, tri: (p) => p.proches, numerique: true },
  { cle: "actif", libelle: "État", rendu: (p) => <TagActif actif={p.actif} oui="Actif" non="Désactivé" />, tri: (p) => (p.actif ? 0 : 1), export: (p) => (p.actif ? "Actif" : "Désactivé") },
]

function OngletPlans() {
  const plans = useQuery(gmaoApi.queries.plans, {})
  const [famille, setFamille] = useState("toutes")
  const [actif, setActif] = useState("actifs")
  const filtres = plans?.filter(
    (p) => (famille === "toutes" || p.famille === famille) && (actif === "tous" || (actif === "actifs" ? p.actif : !p.actif))
  )
  return (
    <TableauDonnees
      libelle="Plans de maintenance préventive"
      colonnes={colonnesPlans}
      lignes={filtres}
      cle={(p) => p.id}
      lien={(p) => `/materiel/preventif/${p.id}`}
      recherche={{ placeholder: "Code, libellé, série…", texte: (p) => `${p.code} ${p.libelle} ${p.series.join(" ")}` }}
      filtres={
        <>
          <SelectFiltre libelle="Famille" icone={TrainFront} value={famille} onChange={setFamille}>
            <option value="toutes">Toutes les familles</option>
            {Object.entries(FAMILLES).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectFiltre>
          <SelectFiltre libelle="État du plan" value={actif} onChange={setActif}>
            <option value="actifs">Plans actifs</option>
            <option value="inactifs">Plans désactivés</option>
            <option value="tous">Tous les plans</option>
          </SelectFiltre>
        </>
      }
      exportNom="plans-preventifs"
      triInitial={{ cle: "code", sens: "asc" }}
      vide={{
        titre: plans && plans.length > 0 ? "Aucun plan pour ces filtres" : "Aucun plan préventif",
        description:
          plans && plans.length > 0
            ? "Élargissez la famille ou l'état."
            : "Créez un plan pour déclencher les visites périodiques du parc au kilométrage ou au calendrier.",
      }}
    />
  )
}

/* ================================================================ Page */

type Cle = "echeances" | "plans"

/** Maintenance préventive : échéances à traiter et plans de maintenance. */
export function PagePreventif() {
  const droits = useDroitsGmao()
  const router = useRouter()
  const echeances = useQuery(gmaoApi.queries.echeances, {})
  const plans = useQuery(gmaoApi.queries.plans, {})
  const [onglet, setOnglet] = useState<Cle>("echeances")
  const [creation, setCreation] = useState(false)

  return (
    <CadreGmao
      titre="Maintenance préventive"
      description="Une échéance tombe au premier seuil atteint, kilométrique ou calendaire. Transformez les échéances en ordres de travail avant qu'elles ne bloquent le parc."
      actions={
        onglet === "plans" && droits.peut("plan_administrer") ? (
          <Button type="button" onClick={() => setCreation(true)}>
            <Plus />
            Créer un plan
          </Button>
        ) : null
      }
    >
      <Onglets<Cle>
        libelle="Préventif"
        valeur={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: "echeances", libelle: "Échéances", compte: echeances?.filter((e) => e.etat === "echue").length },
          { cle: "plans", libelle: "Plans", compte: plans?.filter((p) => p.actif).length },
        ]}
      />
      <div role="tabpanel" aria-label={onglet === "echeances" ? "Échéances" : "Plans"} className="grid gap-4">
        {onglet === "echeances" ? <OngletEcheances peutGenerer={droits.peut("ot_planifier")} /> : <OngletPlans />}
      </div>
      <DialogueCreationPlan
        open={creation}
        onOpenChange={setCreation}
        onCree={({ planId }) => router.push(`/materiel/preventif/${planId}` as Route)}
      />
    </CadreGmao>
  )
}
