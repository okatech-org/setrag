"use client"

import {
  Armchair,
  BookOpen,
  ChartColumn,
  CircleAlert,
  Coins,
  Download,
  HandCoins,
  LockOpen,
  Plug,
  Route,
  Store,
  Tags,
  Ticket,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SchemaLigne } from "@workspace/ui/components/schema-ligne"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"
import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

import {
  EnTetePage,
  Indicateur,
  Indicateurs,
  LienBouton,
  Panneau,
  TableauDonnees,
  telechargerCsv,
  telechargerTexte,
  type ColonneTableau,
} from "@/components/charte"

import { CadrePilotage, usePilotage } from "./cadre"
import { estimerPosition } from "./circulation"
import { useExecution } from "./elements"
import { Barres, LigneRemplissage, type PointSerie } from "./graphiques"
import {
  ajouterJours,
  heureDe,
  jourCourt,
  jourDeService,
  jourLong,
  montant,
  montantCompact,
  nombre,
  nomTrain,
  pct,
  variation,
} from "./format"

export type Periode = "jour" | "7j" | "30j" | "annee"

const PERIODES: { value: Periode; label: string }[] = [
  { value: "jour", label: "Aujourd’hui" },
  { value: "7j", label: "7 jours" },
  { value: "30j", label: "30 jours" },
  { value: "annee", label: "Année" },
]

/** Bornes d’une période qui se termine le jour `au` (inclus). */
export function bornesPeriode(periode: Periode, au: string): { from: string; to: string; libelle: string } {
  switch (periode) {
    case "jour":
      return { from: au, to: au, libelle: jourLong(au) }
    case "7j":
      return { from: ajouterJours(au, -6), to: au, libelle: "7 jours" }
    case "30j":
      return { from: ajouterJours(au, -29), to: au, libelle: "30 jours" }
    case "annee":
      return { from: `${au.slice(0, 4)}-01-01`, to: au, libelle: `année ${au.slice(0, 4)}` }
  }
}

/** Fenêtre du graphique : quatorze jours au moins, pour lire une tendance. */
function fenetreSerie(periode: Periode, au: string) {
  if (periode === "jour" || periode === "7j") return { from: ajouterJours(au, -13), to: au }
  return bornesPeriode(periode, au)
}

const ICONES_DECISION: Record<string, LucideIcon> = {
  livret: BookOpen,
  grille: Tags,
  ecart: HandCoins,
  deversement: Plug,
  journee: LockOpen,
}

type Sens = "hausse" | "baisse" | "vigilance" | "neutre"
function sensDe(pctValeur: number | null | undefined): Sens {
  if (pctValeur === null || pctValeur === undefined || pctValeur === 0) return "neutre"
  return pctValeur > 0 ? "hausse" : "baisse"
}

export function TableauDeBord() {
  const pilotage = usePilotage()
  const convex = useConvex()
  const aujourdhui = jourDeService()
  const [periode, setPeriode] = useState<Periode>("30j")
  const [au, setAu] = useState(aujourdhui)
  const bornes = bornesPeriode(periode, au)
  const serie = fenetreSerie(periode, au)
  const precedente = {
    from: ajouterJours(bornes.from, -(Math.round((Date.parse(bornes.to) - Date.parse(bornes.from)) / 86_400_000) + 1)),
    to: ajouterJours(bornes.from, -1),
  }

  const voitRapports = pilotage.voit("rapports")
  const voitCaisse = pilotage.voit("caisse")
  const voitDessertes = voitRapports || pilotage.voit("places")

  const synthese = useQuery(api.functions.reporting.dashboard, voitRapports ? { from: bornes.from, to: bornes.to } : "skip")
  const disponible = useQuery(api.functions.pilotage.periodeDisponible, voitRapports ? {} : "skip")
  const jours = useQuery(api.functions.reporting.dailySeries, voitRapports ? { from: serie.from, to: serie.to } : "skip")
  const canaux = useQuery(api.functions.reporting.byChannel, voitRapports ? { from: bornes.from, to: bornes.to } : "skip")
  const canauxAvant = useQuery(api.functions.reporting.byChannel, voitRapports ? precedente : "skip")
  const ecarts = useQuery(api.functions.pilotage.syntheseEcarts, voitCaisse ? { from: bornes.from, to: bornes.to } : "skip")
  const decisions = useQuery(api.functions.pilotage.aDecider, pilotage.pret ? {} : "skip")
  const circulations = useQuery(api.functions.pilotage.circulations, voitDessertes ? { date: aujourdhui } : "skip")
  const demain = ajouterJours(aujourdhui, 1)
  const remplissage = useQuery(api.functions.pilotage.remplissageDessertes, voitDessertes ? { date: demain } : "skip")

  const execution = useExecution()
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 30_000)
    return () => window.clearInterval(minuterie)
  }, [])

  const derniere = disponible?.derniere ?? null
  const sansDonnees = synthese !== undefined && !synthese.hasData
  const peutRecaler = sansDonnees && derniere !== null && derniere < bornes.from

  const points: PointSerie[] = useMemo(() => {
    if (!jours) return []
    if (periode === "annee") {
      const parMois = new Map<string, number>()
      for (const j of jours) parMois.set(j.date.slice(0, 7), (parMois.get(j.date.slice(0, 7)) ?? 0) + j.netTtc)
      return [...parMois.entries()].map(([mois, valeur]) => {
        const libelle = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(`${mois}-15T12:00:00Z`)
        )
        return {
          cle: mois,
          etiquette: new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(`${mois}-15T12:00:00Z`)),
          libelle,
          valeur: valeur / 1_000_000,
          texte: (valeur / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }),
        }
      })
    }
    return jours.map((j) => ({
      cle: j.date,
      etiquette: j.date.slice(8) === "01" ? "1er" : String(Number(j.date.slice(8))),
      libelle: jourLong(j.date),
      valeur: j.netTtc / 1_000_000,
      texte: (j.netTtc / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    }))
  }, [jours, periode])

  const trains = useMemo(() => {
    if (!circulations) return undefined
    return circulations.trains
      .map((train) => ({ train, position: estimerPosition(train, maintenant) }))
      .filter(({ position }) => position.etat === "en-route")
  }, [circulations, maintenant])
  const prochain = useMemo(
    () =>
      circulations?.trains
        .filter((t) => t.status !== "annule" && t.departureAt + Math.max(0, t.delayMinutes) * 60_000 > maintenant)
        .sort((a, b) => a.departureAt - b.departureAt)[0],
    [circulations, maintenant]
  )
  const enRetard = trains?.filter(({ train }) => train.delayMinutes > 0).length ?? 0

  const totalCanaux = canaux?.reduce((t, c) => t + c.netTtc, 0) ?? 0
  // Même règle que les chiffres de tête : une période précédente à
  // l'historique incomplet (quelques journées seulement) donnerait une
  // « croissance » fictive de plusieurs milliers de pour cent.
  const comparable = synthese?.comparedTo.comparable === true
  const lignesCanaux = (canaux ?? []).map((c) => {
    const avant = canauxAvant?.find((a) => a.key === c.key)?.netTtc ?? 0
    return {
      ...c,
      part: totalCanaux > 0 ? (c.netTtc / totalCanaux) * 100 : 0,
      evolution: !comparable || avant === 0 ? null : ((c.netTtc - avant) / avant) * 100,
    }
  })
  type LigneCanal = (typeof lignesCanaux)[number]
  const colonnesCanaux: ColonneTableau<LigneCanal>[] = [
    { cle: "canal", libelle: "Canal", rendu: (l) => <b className="font-semibold">{l.label}</b>, tri: (l) => l.label },
    {
      cle: "part",
      libelle: "Part",
      rendu: (l) => (
        <span className="flex min-w-[120px] items-center gap-2">
          <Voie rempli={l.part / 100} className="w-16 flex-none sm:w-24" />
          <span className="font-mono tabular-nums">{pct(Math.round(l.part))}</span>
        </span>
      ),
      tri: (l) => l.part,
    },
    { cle: "recette", libelle: "Recette nette (XAF)", numerique: true, rendu: (l) => montant(l.netTtc), tri: (l) => l.netTtc },
    {
      cle: "evolution",
      libelle: "Évolution",
      numerique: true,
      secondaire: true,
      rendu: (l) => (
        <span className={cn(l.evolution !== null && l.evolution > 0 && "text-success-ink", l.evolution !== null && l.evolution < 0 && "text-danger-ink")}>
          {variation(l.evolution === null ? null : Math.round(l.evolution * 10) / 10)}
        </span>
      ),
      tri: (l) => l.evolution,
      export: (l) => (l.evolution === null ? "" : Math.round(l.evolution * 10) / 10),
    },
  ]

  function exporterSynthese() {
    const lignes: { rubrique: string; libelle: string; valeur: string | number; reference: string | number; evolution: string }[] = []
    if (synthese) {
      lignes.push(
        { rubrique: "Indicateur", libelle: "Recette nette TTC (XAF)", valeur: synthese.revenue.netTtc, reference: synthese.revenue.variation.previous, evolution: variation(synthese.revenue.variation.pct) },
        { rubrique: "Indicateur", libelle: "Billets vendus", valeur: synthese.volume.tickets, reference: synthese.volume.variation.previous, evolution: variation(synthese.volume.variation.pct) },
        { rubrique: "Indicateur", libelle: "Remplissage moyen (%)", valeur: synthese.occupancy.pct, reference: "", evolution: "" },
        { rubrique: "Indicateur", libelle: "Taux de remboursement (%)", valeur: synthese.quality.refundRatePct, reference: "", evolution: "" }
      )
    }
    if (ecarts) {
      lignes.push({ rubrique: "Indicateur", libelle: "Écarts de caisse à viser", valeur: ecarts.aViser, reference: "", evolution: `${ecarts.aViserXaf} XAF` })
    }
    for (const p of jours ?? []) {
      lignes.push({ rubrique: "Recette nette par jour", libelle: p.date, valeur: p.netTtc, reference: p.tickets, evolution: "" })
    }
    for (const c of lignesCanaux) {
      lignes.push({ rubrique: "Ventes par canal", libelle: c.label, valeur: c.netTtc, reference: Math.round(c.part * 10) / 10, evolution: variation(c.evolution === null ? null : Math.round(c.evolution * 10) / 10) })
    }
    telechargerCsv(
      `setrag-synthese-${bornes.from}-${bornes.to}`,
      [
        { libelle: "Rubrique", valeur: (l: (typeof lignes)[number]) => l.rubrique },
        { libelle: "Libellé", valeur: (l: (typeof lignes)[number]) => l.libelle },
        { libelle: "Valeur", valeur: (l: (typeof lignes)[number]) => l.valeur },
        { libelle: "Référence ou part", valeur: (l: (typeof lignes)[number]) => l.reference },
        { libelle: "Évolution", valeur: (l: (typeof lignes)[number]) => l.evolution },
      ],
      lignes
    )
  }

  async function exporterDetail() {
    await execution.executer(
      "detail",
      () => convex.query(api.functions.reporting.exportDailyCsv, { from: bornes.from, to: bornes.to }),
      (r) => {
        telechargerTexte(r.filename, r.content)
        return `${r.filename} téléchargé · ${nombre(r.rowCount)} ligne(s).`
      }
    )
  }

  const recette = synthese ? montantCompact(synthese.revenue.netTtc) : null

  return (
    <CadrePilotage>
      <EnTetePage
        surtitre={`Réseau · ${jourLong(aujourdhui)} · ${heureDe(maintenant)}`}
        titre="Tableau de bord"
        description="Chiffres consolidés des gares, des agences et de la vente en ligne. Les recettes comptent à la clôture de chaque journée comptable : la comptabilité fait foi."
        actions={
          <>
            <SegmentedControl
              label="Période"
              size="touch"
              className="max-w-full"
              options={PERIODES}
              value={periode}
              onValueChange={(valeur) => setPeriode(valeur as Periode)}
            />
            {voitRapports ? (
              <Button type="button" variant="secondary" onClick={exporterSynthese} disabled={!synthese}>
                <Download />
                Exporter la synthèse
              </Button>
            ) : null}
          </>
        }
      />

      {execution.retour}

      {!voitRapports && pilotage.pret ? (
        <InlineMessage tone="info" title="Indicateurs commerciaux non accessibles à votre rôle.">
          Les recettes, billets et remplissages demandent le droit de consulter les rapports. Les décisions qui vous
          concernent restent listées ci-dessous.
        </InlineMessage>
      ) : null}

      {voitRapports && sansDonnees ? (
        <InlineMessage tone="info" title={`Aucune journée clôturée sur la période (${bornes.libelle}).`}>
          <span className="flex flex-wrap items-center gap-3">
            <span>
              {derniere
                ? `Les derniers chiffres consolidés datent du ${jourLong(derniere)}.`
                : "Aucune journée n’a encore été clôturée : les indicateurs apparaissent après la première clôture."}
            </span>
            {peutRecaler && derniere ? (
              <Button type="button" variant="secondary" onClick={() => setAu(derniere)}>
                Afficher jusqu’au {jourCourt(derniere)}
              </Button>
            ) : null}
          </span>
        </InlineMessage>
      ) : null}
      {au !== aujourdhui ? (
        <InlineMessage tone="warning" title={`Période arrêtée au ${jourLong(au)}.`}>
          <Button type="button" variant="ghost" onClick={() => setAu(aujourdhui)}>
            Revenir à aujourd’hui
          </Button>
        </InlineMessage>
      ) : null}

      {voitRapports ? (
        <Indicateurs colonnes={4}>
          <Indicateur
            fort
            icone={Coins}
            libelle={`Recette nette · ${bornes.libelle}`}
            valeur={recette ? recette.chiffre : "—"}
            unite={recette?.unite}
            evolution={
              synthese
                ? { sens: sensDe(synthese.revenue.variation.pct), texte:
                      synthese.revenue.variation.pct === null
                        ? "pas de période précédente comparable"
                        : `${variation(synthese.revenue.variation.pct)} vs période précédente`,
                  }
                : undefined
            }
          />
          <Indicateur
            icone={Ticket}
            libelle="Billets vendus"
            valeur={synthese ? nombre(synthese.volume.tickets) : "—"}
            evolution={synthese ? { sens: sensDe(synthese.volume.variation.pct), texte: variation(synthese.volume.variation.pct) } : undefined}
          />
          <Indicateur
            icone={Armchair}
            libelle="Remplissage moyen"
            valeur={synthese ? pct(Math.round(synthese.occupancy.pct)) : "—"}
            remplissage={synthese ? synthese.occupancy.pct / 100 : undefined}
            evolution={synthese ? { sens: "neutre", texte: `${nombre(synthese.occupancy.tripCount)} desserte(s), en sièges-km` } : undefined}
          />
          {voitCaisse ? (
            <Indicateur
              icone={HandCoins}
              libelle="Écarts de caisse"
              valeur={ecarts ? nombre(ecarts.aViser) : "—"}
              unite="à viser"
              evolution={
                ecarts
                  ? ecarts.aViser > 0
                    ? { sens: "vigilance", texte: `${ecarts.aViserXaf > 0 ? "+" : "−"}${montant(Math.abs(ecarts.aViserXaf))} XAF au total` }
                    : { sens: "neutre", texte: `${nombre(ecarts.sessions)} caisse(s) sur la période` }
                  : undefined
              }
            />
          ) : (
            <Indicateur
              icone={Store}
              libelle="Taux de remboursement"
              valeur={synthese ? pct(synthese.quality.refundRatePct) : "—"}
              evolution={synthese ? { sens: "neutre", texte: `${nombre(synthese.quality.refundedCount + synthese.quality.cancelledCount)} opération(s)` } : undefined}
            />
          )}
        </Indicateurs>
      ) : null}

      {voitDessertes ? (
        <Panneau
          titre="Trains en circulation"
          icone={Route}
          sousTitre={`Position estimée d’après l’horaire et le retard annoncé · ${heureDe(maintenant)}`}
          actions={
            trains ? (
              <>
                <Tag tone="success">{`${trains.length - enRetard} à l’heure`}</Tag>
                {enRetard > 0 ? <Tag tone="warning">{`${enRetard} en retard`}</Tag> : null}
              </>
            ) : null
          }
        >
          {circulations === undefined ? (
            <SkeletonLines />
          ) : (
            <>
              <div className="min-w-0 overflow-x-auto">
                <SchemaLigne
                  className="min-w-[560px]"
                  gares={circulations.gares.map((g) => ({
                    nom: g.name,
                    km: g.km,
                    majeure: ["OWE", "NDJ", "BOO", "LTV", "FCV"].includes(g.code),
                  }))}
                  trains={(trains ?? []).map(({ train, position }) => ({
                    km: position.etat === "en-route" ? position.km : 0,
                    libelle: `${train.trainType.charAt(0)} ${train.trainNumber.replace(/^[A-Z]+-/, "")}`,
                    etat: train.delayMinutes > 0 ? "retard" : "ok",
                    sens: position.etat === "en-route" ? position.sens : "aller",
                  }))}
                  aria-label={`Ligne du Transgabonais et ${trains?.length ?? 0} train(s) en circulation, à leur position estimée`}
                />
              </div>
              {trains && trains.length > 0 ? (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {trains.map(({ train, position }) => (
                    <li key={train.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13.5px]">
                      <span className="grid min-w-0">
                        <b className="truncate">{nomTrain(train.trainType, train.trainNumber)}</b>
                        <small className="truncate text-ink-muted">
                          {position.etat === "en-route" && position.entre
                            ? `Entre ${position.entre[0]} et ${position.entre[1]}`
                            : `${train.origin} → ${train.destination}`}
                        </small>
                      </span>
                      {train.delayMinutes > 0 ? (
                        <Tag tone="warning">{`+${train.delayMinutes} min`}</Tag>
                      ) : (
                        <Tag tone="success">À l’heure</Tag>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-muted">
                  Aucun train en ligne à {heureDe(maintenant)}.
                  {prochain
                    ? ` Prochain départ : ${nomTrain(prochain.trainType, prochain.trainNumber)} à ${heureDe(prochain.departureAt + Math.max(0, prochain.delayMinutes) * 60_000)} depuis ${prochain.origin}.`
                    : " Aucun autre départ prévu aujourd’hui."}
                </p>
              )}
            </>
          )}
        </Panneau>
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {voitRapports ? (
          <Panneau
            titre="Recette nette par jour"
            icone={ChartColumn}
            sousTitre={periode === "annee" ? "millions de XAF · par mois" : `millions de XAF · du ${jourCourt(serie.from)} au ${jourCourt(serie.to)}`}
            actions={pilotage.voit("journee_comptable") ? <LienBouton href="/gestion/recettes">Détail des recettes</LienBouton> : null}
          >
            {jours === undefined ? (
              <SkeletonLines />
            ) : points.every((p) => p.valeur === 0) ? (
              <EmptyState
                title="Aucune recette clôturée sur cette fenêtre"
                description="Les recettes s’affichent au lendemain de la clôture de chaque journée comptable."
              />
            ) : (
              <Barres
                points={points}
                libelle="Recette nette par jour"
                unite="M XAF"
                legendeTableau={`recette nette ${periode === "annee" ? "par mois" : "par jour"}`}
              />
            )}
          </Panneau>
        ) : null}

        <Panneau titre="À décider" icone={CircleAlert} plein className={cn(!voitRapports && "xl:col-span-2")}>
          {decisions === undefined ? (
            <div className="p-4">
              <SkeletonLines />
            </div>
          ) : decisions.length === 0 ? (
            <EmptyState title="Rien n’attend de décision" description="Les livrets, grilles, écarts de caisse et déversements sont à jour." />
          ) : (
            <ul className="grid">
              {decisions.map((d) => {
                const Icone = ICONES_DECISION[d.genre] ?? CircleAlert
                return (
                  <li key={d.cle} className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <Icone
                      aria-hidden
                      className={cn(
                        "mt-0.5 size-[18px] shrink-0",
                        d.ton === "danger" && "text-danger-ink",
                        d.ton === "veille" && "text-warning-ink",
                        d.ton === "info" && "text-info-ink"
                      )}
                    />
                    <span className="grid min-w-0 flex-1 text-[14px]">
                      <b className="font-semibold">{d.titre}</b>
                      <small className="text-[12.5px] text-ink-muted">{d.detail}</small>
                    </span>
                    <LienBouton href={d.lien}>{d.genre === "deversement" || d.genre === "ecart" ? "Voir" : "Ouvrir"}</LienBouton>
                  </li>
                )
              })}
            </ul>
          )}
        </Panneau>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
        {voitDessertes ? (
          <Panneau titre="Remplissage des dessertes de demain" icone={Armchair} sousTitre={jourLong(demain)}>
            {remplissage === undefined ? (
              <SkeletonLines />
            ) : remplissage.length === 0 ? (
              <EmptyState title="Aucune desserte demain" description="Aucun train n’est programmé au livret pour cette date." />
            ) : (
              <ol className="grid gap-3">
                {remplissage.map((d) => (
                  <LigneRemplissage
                    key={d.tripId}
                    titre={
                      <>
                        {nomTrain(d.trainType, d.trainNumber)}
                        {d.status === "annule" ? <span className="ml-2 text-danger-ink">· Supprimé</span> : null}
                      </>
                    }
                    detail={`${d.origin} → ${d.destination} · ${heureDe(d.departureAt)} · ${nombre(d.seatsSold)}/${nombre(d.capacity)} pl. · pointe ${Math.round(d.peakPct)} %`}
                    taux={d.loadFactorPct}
                  />
                ))}
              </ol>
            )}
          </Panneau>
        ) : null}

        {voitRapports ? (
          <Panneau titre="Ventes par canal" icone={Store} sousTitre={`${bornes.libelle} · part de la recette nette`}>
            <TableauDonnees
              colonnes={colonnesCanaux}
              lignes={canaux === undefined ? undefined : lignesCanaux}
              cle={(l) => l.key}
              libelle="Ventes par canal"
              exportNom="setrag-ventes-par-canal"
              triInitial={{ cle: "recette", sens: "desc" }}
              vide={{ titre: "Aucune vente clôturée sur la période", description: "Les canaux apparaissent après la clôture des journées." }}
              outils={
                pilotage.peut("rapports", "creer") ? (
                  <Button type="button" variant="ghost" onClick={exporterDetail} loading={execution.enCours === "detail"}>
                    Détail jour × canal
                  </Button>
                ) : null
              }
            />
          </Panneau>
        ) : null}
      </div>
    </CadrePilotage>
  )
}
