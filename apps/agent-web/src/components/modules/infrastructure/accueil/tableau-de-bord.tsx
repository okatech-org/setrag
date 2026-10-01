"use client"

import {
  ArrowRight,
  BrickWall,
  CalendarRange,
  CircleDashed,
  Clock,
  Construction,
  Flag,
  Gauge,
  ListChecks,
  RadioTower,
  Ruler,
  ShieldAlert,
  Spline,
  TrafficCone,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"

import { Indicateur, Indicateurs, LienBouton, Panneau } from "@/components/charte"
import { Remplissage } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { CadreInfra, DossierEnChargement, infraApi, minutes, pct, pk, useDroitsInfra, xafCompact, type AccueilInfra } from "../commun"
import { SchemaVoie } from "../schema-voie"
import { DialogueSignalement } from "../anomalies/signaler-anomalie"
import { zonesLtv } from "./partage"

type Priorite = AccueilInfra["priorites"][number]

const fmtKm = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

const TYPES_PRIORITE: Record<Priorite["type"], { libelle: string; icone: LucideIcon }> = {
  anomalie: { libelle: "Anomalie", icone: TriangleAlert },
  ltv: { libelle: "LTV", icone: Gauge },
  inspection: { libelle: "Inspection d'ouvrage", icone: BrickWall },
  jalon: { libelle: "Jalon PRN", icone: Construction },
  intervention: { libelle: "Plage travaux", icone: CalendarRange },
}

const NIVEAUX: Record<Priorite["niveau"], { libelle: string; ton: "danger" | "warning" | "neutral"; icone: LucideIcon }> = {
  critique: { libelle: "Critique", ton: "danger", icone: ShieldAlert },
  haute: { libelle: "Haute", ton: "warning", icone: TriangleAlert },
  normale: { libelle: "Normale", ton: "neutral", icone: CircleDashed },
}

/**
 * Dossier ouvert par une priorité. Les inspections en retard portent
 * l'identifiant de l'ouvrage ; un jalon porte le sien, et son chantier se
 * retrouve par le code en tête du titre (« PRN-03 — jalon en retard »).
 */
export function lienPriorite(priorite: Priorite, chantiers: readonly { id: string; code: string }[] | undefined): string {
  switch (priorite.type) {
    case "anomalie":
      return `/infrastructures/anomalies/${priorite.id}`
    case "ltv":
      return `/infrastructures/ltv/${priorite.id}`
    case "inspection":
      return `/infrastructures/ouvrages/${priorite.id}`
    case "intervention":
      return `/infrastructures/interventions/${priorite.id}`
    case "jalon": {
      if ("chantierId" in priorite && priorite.chantierId) return `/infrastructures/prn/${priorite.chantierId}`
      const code = priorite.titre.split(" — ")[0]?.trim()
      const chantier = chantiers?.find((c) => c.code === code)
      return chantier ? `/infrastructures/prn/${chantier.id}` : "/infrastructures/prn"
    }
  }
}

export function TableauDeBordInfra() {
  const accueil = useQuery(infraApi.queries.accueil, {})
  const formulaires = useQuery(infraApi.queries.formulaires, accueil?.priorites.some((p) => p.type === "jalon") ? {} : "skip")
  const droits = useDroitsInfra()
  return <TableauDeBordVue accueil={accueil} chantiers={formulaires?.chantiers} peutSignaler={!droits.chargement && droits.peut("anomalie_signaler")} />
}

export function TableauDeBordVue({
  accueil,
  chantiers,
  peutSignaler,
}: {
  accueil: AccueilInfra | undefined
  chantiers?: readonly { id: string; code: string }[]
  peutSignaler: boolean
}) {
  const [signalement, setSignalement] = useState(false)
  const actions = peutSignaler ? (
    <Button type="button" onClick={() => setSignalement(true)}>
      <Flag />
      Signaler une anomalie
    </Button>
  ) : undefined

  return (
    <CadreInfra
      titre="Infrastructures ferroviaires"
      description="L'état de la voie Owendo–Franceville, les anomalies à traiter, les limitations de vitesse en vigueur et l'avancement du Programme de remise à niveau (PRN)."
      actions={actions}
    >
      {accueil === undefined ? (
        <DossierEnChargement />
      ) : accueil.indicateurs.nbSections === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState
            title="Aucune section de voie n'est renseignée"
            description="Le tableau de bord se construit sur le découpage de la ligne en sections : sans lui, ni LTV, ni rattachement des anomalies. Chargez le référentiel de voie, puis revenez ici."
            action={<LienBouton href="/infrastructures/voie">Voir la rubrique Voie et sections</LienBouton>}
          />
        </div>
      ) : (
        <Contenu accueil={accueil} chantiers={chantiers} />
      )}
      {peutSignaler ? <DialogueSignalement open={signalement} onOpenChange={setSignalement} /> : null}
    </CadreInfra>
  )
}

function Contenu({ accueil, chantiers }: { accueil: AccueilInfra; chantiers?: readonly { id: string; code: string }[] }) {
  const { indicateurs: i, ligne, priorites } = accueil
  const etats = i.sectionsParEtat
  const prn = i.prn
  return (
    <>
      <Panneau
        titre="La ligne aujourd'hui"
        icone={Spline}
        sousTitre={`${fmtKm.format(ligne.longueurKm)} km · ${i.ltv.actives} LTV active${i.ltv.actives > 1 ? "s" : ""}`}
        actions={
          <LienBouton href="/infrastructures/ltv" variante="ghost" taille="sm">
            Limitations
            <ArrowRight />
          </LienBouton>
        }
      >
        <SchemaVoie gares={ligne.gares} zones={zonesLtv(ligne.ltv)} />
      </Panneau>

      <section aria-labelledby="titre-voie" className="grid gap-3">
        <h2 id="titre-voie" className="text-[16px] font-bold">
          Voie
        </h2>
        <Indicateurs colonnes={4}>
          <Indicateur libelle="Longueur de ligne" icone={Ruler} valeur={fmtKm.format(i.longueurKm)} unite="km" evolution={{ sens: "neutre", texte: `${i.nbSections} sections de maintenance` }} />
          <Indicateur libelle="Traverses béton" icone={Spline} valeur={pct(i.partBetonPct)} remplissage={i.partBetonPct / 100} evolution={{ sens: "neutre", texte: "Part pondérée par la longueur" }} />
          <Indicateur
            libelle="Sections par état"
            icone={ListChecks}
            valeur={`${etats.bon} bon${etats.bon > 1 ? "s" : ""}`}
            evolution={{
              sens: etats.critique > 0 ? "baisse" : etats.degrade > 0 ? "vigilance" : "neutre",
              texte: `${etats.moyen} moyen${etats.moyen > 1 ? "s" : ""} · ${etats.degrade} dégradé${etats.degrade > 1 ? "s" : ""} · ${etats.critique} critique${etats.critique > 1 ? "s" : ""}`,
            }}
          />
          <Indicateur
            libelle="Sous limitation de vitesse"
            icone={TrafficCone}
            valeur={fmtKm.format(i.ltv.kmSousLtv)}
            unite="km"
            evolution={{ sens: i.ltv.actives > 0 ? "vigilance" : "neutre", texte: `${i.ltv.actives} LTV · ${minutes(i.ltv.perteTempsMinutes)} perdues par train` }}
          />
        </Indicateurs>
      </section>

      <section aria-labelledby="titre-anomalies" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titre-anomalies" className="text-[16px] font-bold">
            Anomalies et patrimoine
          </h2>
          <span className="ml-auto">
            <LienBouton href="/infrastructures/anomalies" variante="ghost" taille="sm">
              Registre des anomalies
              <ArrowRight />
            </LienBouton>
          </span>
        </div>
        <Indicateurs colonnes={4}>
          <Indicateur
            libelle="Anomalies ouvertes"
            icone={TriangleAlert}
            valeur={i.anomalies.ouvertes}
            evolution={{
              sens: i.anomalies.parGravite.critique > 0 ? "baisse" : "neutre",
              texte: `${i.anomalies.parGravite.critique} critique · ${i.anomalies.parGravite.elevee} élevée · ${i.anomalies.parGravite.moyenne} moyenne · ${i.anomalies.parGravite.faible} faible`,
            }}
          />
          <Indicateur
            libelle="Anomalies en retard"
            icone={Clock}
            valeur={i.anomalies.enRetard}
            evolution={{ sens: i.anomalies.enRetard > 0 ? "baisse" : "neutre", texte: `${i.anomalies.aClore} traitée${i.anomalies.aClore > 1 ? "s" : ""}, à clore` }}
          />
          <Indicateur
            libelle="Ouvrages cotés 3 ou 3U"
            icone={BrickWall}
            valeur={i.ouvrages.cotes3 + i.ouvrages.cotes3U}
            evolution={{
              sens: i.ouvrages.cotes3U > 0 ? "baisse" : i.ouvrages.inspectionsEnRetard > 0 ? "vigilance" : "neutre",
              texte: `${i.ouvrages.cotes3U} en urgence (3U) · ${i.ouvrages.inspectionsEnRetard} inspection${i.ouvrages.inspectionsEnRetard > 1 ? "s" : ""} en retard sur ${i.ouvrages.total} ouvrages`,
            }}
          />
          <Indicateur
            libelle="Équipements dégradés ou hors service"
            icone={RadioTower}
            valeur={i.equipements.degrades + i.equipements.horsService}
            evolution={{
              sens: i.equipements.horsService > 0 ? "baisse" : i.equipements.degrades > 0 ? "vigilance" : "neutre",
              texte: `${i.equipements.horsService} hors service · ${i.equipements.degrades} dégradé${i.equipements.degrades > 1 ? "s" : ""} · ${i.equipements.maintenancesEnRetard} maintenance${i.equipements.maintenancesEnRetard > 1 ? "s" : ""} en retard`,
            }}
          />
        </Indicateurs>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Panneau titre="Priorités" icone={ShieldAlert} sousTitre={`${priorites.length} point${priorites.length > 1 ? "s" : ""} à suivre`} plein>
          {priorites.length === 0 ? (
            <p className="text-small p-4 text-ink-muted">Aucune priorité : pas d&apos;anomalie grave en attente, ni d&apos;échéance dépassée, ni de travaux aujourd&apos;hui.</p>
          ) : (
            <ul className="grid">
              {priorites.map((priorite) => {
                const type = TYPES_PRIORITE[priorite.type]
                const niveau = NIVEAUX[priorite.niveau]
                const Icone = type.icone
                return (
                  <li key={`${priorite.type}-${priorite.id}`} className="border-t border-line first:border-t-0">
                    <Link href={lienPriorite(priorite, chantiers) as Route} className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 hover:bg-surface-sunk">
                      <Icone aria-hidden className="mt-0.5 size-[18px] text-ink-muted" />
                      <span className="grid min-w-0 gap-0.5">
                        <b className="text-[14px] font-semibold">{priorite.titre}</b>
                        <small className="text-[12.5px] text-ink-muted">{priorite.detail}</small>
                        <small className="text-[12.5px] text-ink-muted">
                          {type.libelle}
                          {priorite.pk !== undefined ? <> · <span className="tabular">{pk(priorite.pk)}</span></> : null}
                          {priorite.echeance !== undefined ? (
                            <>
                              {" "}
                              · {priorite.type === "intervention" ? "début" : "échéance"} <span className="tabular">{priorite.type === "intervention" ? dateHeure(priorite.echeance) : dateCourte(priorite.echeance)}</span>
                            </>
                          ) : null}
                        </small>
                      </span>
                      <Pastille ton={niveau.ton} icone={niveau.icone}>
                        {niveau.libelle}
                      </Pastille>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panneau>

        <Panneau
          titre="Programme PRN"
          icone={Construction}
          sousTitre={`${prn.chantiersEnCours} chantier${prn.chantiersEnCours > 1 ? "s" : ""} en cours sur ${prn.chantiers}`}
          actions={
            <LienBouton href="/infrastructures/prn" variante="ghost" taille="sm">
              Chantiers
              <ArrowRight />
            </LienBouton>
          }
        >
          <dl className="grid grid-cols-3 gap-3 text-[13px]">
            <div className="grid gap-0.5">
              <dt className="text-ink-muted">Budget</dt>
              <dd className="tabular text-[15px] font-bold">{xafCompact(prn.budgetFcfa)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-ink-muted">Engagé</dt>
              <dd className="tabular text-[15px] font-bold">{xafCompact(prn.engageFcfa)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-ink-muted">Payé</dt>
              <dd className="tabular text-[15px] font-bold">{xafCompact(prn.payeFcfa)}</dd>
            </div>
          </dl>
          <ul className="grid gap-3">
            <Remplissage libelle="Avancement physique" detail="Pondéré par le budget, situations validées" part={prn.avancementPhysiquePct / 100} valeur={pct(prn.avancementPhysiquePct)} />
            <Remplissage libelle="Avancement financier" detail="Payé rapporté au budget" part={prn.avancementFinancierPct / 100} valeur={pct(prn.avancementFinancierPct)} />
          </ul>
          <p className={prn.jalonsEnRetard > 0 ? "text-small font-semibold text-danger-ink" : "text-small text-ink-muted"}>
            {prn.jalonsEnRetard > 0 ? `${prn.jalonsEnRetard} jalon${prn.jalonsEnRetard > 1 ? "s" : ""} en retard` : "Aucun jalon en retard"}
          </p>
        </Panneau>
      </div>
      <p className="text-small text-ink-muted">
        Données calculées le <span className="tabular">{dateHeure(accueil.genereLe)}</span>, mises à jour en continu.
      </p>
    </>
  )
}
