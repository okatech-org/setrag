"use client"

import type { FunctionReturnType } from "convex/server"
import { Armchair, CalendarDays, Layers, Plus, Route as RouteIcon, SlidersHorizontal, TrainFront, TrendingUp, Users } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { ChampsRegle, TYPES_REGLE, bornes, declencheur, lireRegle, portee } from "@/components/pricing-rule-detail"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { DateFiltre, Puces, Remplissage, RetourOperation, SelectFiltre, useOperation } from "./elements"
import { aujourdhuiService, CLASSES, coefficient, dateService, libelleDesserte, millions, montant, nombre, ORDRE_CLASSES, pourcent, type ClasseService } from "./format"
import { FenetreFormulaire } from "./formulaire"
import { ETATS_REGLE, TagRegle } from "./statuts"

type Regle = FunctionReturnType<typeof api.functions.referentiels.reglesYield>[number]
type Courbe = NonNullable<FunctionReturnType<typeof api.functions.referentiels.courbeYield>>

/* ================================================================ Courbe */

/**
 * Prix d'une desserte selon l'anticipation : le tarif de base en pointillé,
 * le prix appliqué en trait plein, aujourd'hui marqué d'un point étiqueté.
 * Le tableau qui suit donne les mêmes valeurs.
 */
export function CourbePrix({ courbe }: { courbe: Courbe }) {
  const points = courbe.points
  if (points.length === 0 || courbe.prixGrille === null) return null
  const W = 640
  const H = 230
  const gauche = 52
  const droite = 18
  const bas = 30
  const haut = 16
  const prix = [...points.map((p) => p.prix), courbe.prixGrille]
  const min = Math.min(...prix)
  const max = Math.max(...prix)
  const marge = Math.max((max - min) * 0.2, max * 0.05)
  const bas0 = Math.max(0, min - marge)
  const haut0 = max + marge
  const x = (jours: number) => gauche + ((60 - jours) / 60) * (W - gauche - droite)
  const y = (valeur: number) => H - bas - ((valeur - bas0) / (haut0 - bas0)) * (H - bas - haut)
  // Tracé en marches : le prix change d'un coup au seuil d'une règle.
  let trace = `M${x(points[0]!.jours).toFixed(1)} ${y(points[0]!.prix).toFixed(1)}`
  for (let i = 1; i < points.length; i += 1) {
    trace += ` H${x(points[i]!.jours).toFixed(1)} V${y(points[i]!.prix).toFixed(1)}`
  }
  const graduations = Array.from({ length: 4 }, (_, i) => bas0 + ((haut0 - bas0) * (i + 0.5)) / 4)
  const aujourdhui = courbe.aujourdhui && courbe.aujourdhui.jours <= 60 ? courbe.aujourdhui : null
  const paliers = points.filter((p, i) => i === 0 || p.prix !== points[i - 1]!.prix)
  const k = (v: number) => `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`
  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Prix selon le nombre de jours avant le départ : de ${montant(points[0]!.prix)} à J−60 à ${montant(points[points.length - 1]!.prix)} XAF le jour du départ ; tarif de base ${montant(courbe.prixGrille)} XAF.`}
        className="h-auto w-full overflow-visible"
      >
        {graduations.map((g) => (
          <g key={g}>
            <line x1={gauche} x2={W - droite} y1={y(g)} y2={y(g)} style={{ stroke: "var(--c-line)" }} />
            <text x={gauche - 8} y={y(g) + 4} textAnchor="end" className="font-mono text-[11px]" style={{ fill: "var(--c-ink-muted)" }}>
              {k(g)}
            </text>
          </g>
        ))}
        {[60, 45, 30, 21, 14, 7, 1].map((j) => (
          <text key={j} x={x(j)} y={H - 8} textAnchor="middle" className="font-mono text-[11px]" style={{ fill: "var(--c-ink-muted)" }}>
            J−{j}
          </text>
        ))}
        <path d={`${trace} V${y(bas0)} H${x(60)} Z`} style={{ fill: "var(--c-accent-soft)", opacity: 0.6 }} />
        <line x1={gauche} x2={W - droite} y1={y(courbe.prixGrille)} y2={y(courbe.prixGrille)} style={{ stroke: "var(--c-ink-muted)", strokeDasharray: "4 4", strokeWidth: 1.5 }} />
        <text x={W - droite} y={y(courbe.prixGrille) - 6} textAnchor="end" className="font-mono text-[11px]" style={{ fill: "var(--c-ink-muted)" }}>
          Tarif de base {montant(courbe.prixGrille)}
        </text>
        <path d={trace} style={{ fill: "none", stroke: "var(--c-accent)", strokeWidth: 2.5, strokeLinejoin: "round" }} />
        {aujourdhui ? (
          <g>
            <circle cx={x(aujourdhui.jours)} cy={y(aujourdhui.prix)} r={5} style={{ fill: "var(--c-surface)", stroke: "var(--c-accent)", strokeWidth: 2.5 }} />
            <text
              x={x(aujourdhui.jours) + (aujourdhui.jours > 30 ? 10 : -10)}
              y={y(aujourdhui.prix) - 12}
              textAnchor={aujourdhui.jours > 30 ? "start" : "end"}
              className="font-mono text-[12px] font-semibold"
              style={{ fill: "var(--c-ink)" }}
            >
              Aujourd’hui · {montant(aujourdhui.prix)}
            </text>
          </g>
        ) : null}
      </svg>
      <p className="flex flex-wrap gap-4 text-[13px] text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="h-[3px] w-[18px] rounded-[2px] bg-accent-base" />
          Prix appliqué
        </span>
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="w-[18px] border-t-2 border-dashed border-ink-muted" />
          Tarif de base (pointillé)
        </span>
        {courbe.reglesSuspendues > 0 ? <span>{courbe.reglesSuspendues} règle(s) suspendue(s), non comptée(s)</span> : null}
      </p>
      <details className="text-[13.5px]">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent-ink">Voir le tableau : paliers de prix</summary>
        <table className="w-full text-left">
          <caption className="sr-only">Paliers de prix selon les jours avant le départ</caption>
          <thead>
            <tr className="text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
              <th scope="col" className="py-1.5">À partir de</th>
              <th scope="col" className="py-1.5 text-right">Prix</th>
              <th scope="col" className="py-1.5 pl-4">Règles appliquées</th>
            </tr>
          </thead>
          <tbody>
            {paliers.map((p) => (
              <tr key={p.jours} className="border-t border-line">
                <td className="tabular py-1.5">J−{p.jours}</td>
                <td className="tabular py-1.5 text-right">{montant(p.prix)}</td>
                <td className="py-1.5 pl-4">{p.regles.join(", ") || "aucune"}{p.borne ? " · borné" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function PanneauCourbe() {
  const [date, setDate] = useState(aujourdhuiService(3))
  const [tripId, setTripId] = useState("")
  const [classe, setClasse] = useState<ClasseService>("DEUXIEME")
  const dessertes = useQuery(api.functions.referentiels.dessertes, { serviceDate: date, pour: "yield" })
  const choisie = tripId && dessertes?.some((d) => d.id === tripId) ? tripId : (dessertes?.[0]?.id ?? "")
  const courbe = useQuery(api.functions.referentiels.courbeYield, choisie ? { tripId: choisie as never, serviceClass: classe } : "skip")
  return (
    <>
      <Panneau
        titre={courbe?.desserte ? `${courbe.desserte.trainName ?? courbe.desserte.trainNumber} · ${CLASSES[classe].long}` : "Courbe de prix"}
        icone={TrendingUp}
        sousTitre={courbe?.desserte ? `départ du ${dateService(courbe.desserte.serviceDate)} · prix selon les jours avant départ` : "prix selon les jours avant départ"}
      >
        <div className="flex flex-wrap gap-2">
          <DateFiltre libelle="Date du départ" icone={CalendarDays} value={date} onChange={setDate} />
          <SelectFiltre libelle="Desserte" icone={TrainFront} value={choisie} onChange={setTripId} className="min-w-[220px] flex-1">
            {dessertes?.length === 0 ? <option value="">Aucune desserte ce jour</option> : null}
            {dessertes?.map((d) => (
              <option key={d.id} value={d.id}>
                {libelleDesserte(d)}
              </option>
            ))}
          </SelectFiltre>
          <Puces libelle="Classe" valeur={classe} onChange={setClasse} options={ORDRE_CLASSES.map((c) => ({ cle: c, libelle: CLASSES[c].court }))} />
        </div>
        {!choisie ? (
          dessertes === undefined ? <SkeletonLines /> : <p className="text-small text-ink-muted">Aucune desserte ce jour : choisissez une autre date.</p>
        ) : courbe === undefined ? (
          <SkeletonLines />
        ) : courbe === null ? null : courbe.etat !== "ok" ? (
          <InlineMessage tone="info" title={courbe.etat === "sans_grille" ? "Aucune grille tarifaire active." : courbe.etat === "sans_base" ? "La grille active ne couvre pas cette classe pour ce train." : "Cette classe n'existe pas dans la composition."}>
            La courbe se calcule à partir du barème actif et des règles en vigueur.
          </InlineMessage>
        ) : (
          <CourbePrix courbe={courbe} />
        )}
      </Panneau>
      <Panneau titre="Quotas tarifaires" icone={Layers} sousTitre={courbe ? `remplissage actuel ${pourcent(courbe.remplissage)} · ${nombre(courbe.vendues)} / ${nombre(courbe.capacite)}` : "part des places"}>
        {courbe && courbe.quotas.length > 0 ? (
          <>
            <ol className="grid gap-2.5">
              {courbe.quotas.map((quota) => {
                const total = courbe.quotas.reduce((t, q) => t + q.seatCount, 0) || 1
                return (
                  <Remplissage
                    key={quota.id}
                    libelle={quota.label}
                    detail={`${coefficient((quota.coefficient - 1) * 100)} · ${nombre(quota.soldCount)} / ${nombre(quota.seatCount)} vendues${quota.isActive ? "" : " · fermé"}`}
                    part={quota.seatCount / total}
                  />
                )
              })}
            </ol>
            <p className="text-[12.5px] text-ink-muted">Quand un contingent est vendu, le prix passe au palier suivant, quel que soit le canal.</p>
          </>
        ) : (
          <p className="text-small text-ink-muted">Aucun contingent tarifaire sur cette desserte : toutes les places se vendent au prix de la grille, modulé par les règles.</p>
        )}
      </Panneau>
    </>
  )
}

/* ================================================================= Écran */

function DialogueRegle({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const creer = useMutation(api.functions.referentiels.creerRegleYield)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Nouvelle règle de yield"
      description="Chaque règle a un déclencheur, une modulation et, au besoin, un plancher et un plafond. Elle s'applique au guichet comme en ligne, au même instant."
      libelleValider={
        <>
          <Plus />
          Créer la règle
        </>
      }
      enCours={operation.enCours === "creer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeurs = lireRegle(donnees)
        const id = await operation.executer("creer", () => creer({ ...valeurs, isActive: donnees.get("active") === "on" }))
        if (id) onOpenChange(false)
      }}
    >
      <ChampsRegle />
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="active" defaultChecked className="size-5 accent-[var(--c-accent)]" />
        Activer la règle dès sa création
      </label>
    </FenetreFormulaire>
  )
}

export function YieldManagement() {
  const droits = useDroitsGestion()
  const peutVoir = droits.may("yield")
  const regles = useQuery(api.functions.referentiels.reglesYield, peutVoir ? {} : "skip")
  const indicateurs = useQuery(api.functions.referentiels.indicateursYield, peutVoir ? {} : "skip")
  const basculer = useMutation(api.functions.administration.setPricingRuleStatus)
  const operation = useOperation()
  const [creation, setCreation] = useState(false)
  const [etat, setEtat] = useState("toutes")
  const peutActiver = droits.may("yield", "modifier")
  const peutSuspendre = droits.may("yield", "supprimer")

  const evolution = (courant: number | null, precedent: number | null) => {
    if (!courant || !precedent) return undefined
    const ecart = (courant - precedent) / precedent
    return { sens: ecart >= 0 ? ("hausse" as const) : ("baisse" as const), texte: `${ecart >= 0 ? "+" : "−"}${Math.abs(ecart * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % sur 30 j` }
  }

  const colonnes: ColonneTableau<Regle>[] = [
    { cle: "regle", libelle: "Règle", rendu: (r) => <CelluleDouble haut={r.label ?? TYPES_REGLE[r.type]} bas={<span className="tabular">{r.code}</span>} />, tri: (r) => r.label ?? r.code, export: (r) => `${r.label ?? TYPES_REGLE[r.type]} (${r.code})` },
    { cle: "declencheur", libelle: "Déclencheur", rendu: (r) => declencheur(r), tri: (r) => r.type },
    { cle: "coefficient", libelle: "Coefficient", rendu: (r) => coefficient(r.modifierPct), tri: (r) => r.modifierPct, numerique: true, export: (r) => coefficient(r.modifierPct) },
    { cle: "bornes", libelle: "Plancher · plafond", rendu: (r) => <span className="tabular text-[13.5px]">{bornes(r)}</span>, export: (r) => bornes(r), secondaire: true },
    { cle: "portee", libelle: "Trains", rendu: (r) => portee(r, r.desserte), tri: (r) => r.scope, secondaire: true },
    { cle: "etat", libelle: "État", rendu: (r) => <TagRegle etat={r.etat} />, tri: (r) => Object.keys(ETATS_REGLE).indexOf(r.etat), export: (r) => ETATS_REGLE[r.etat].libelle },
    {
      cle: "activation",
      libelle: "Activation",
      rendu: (r) => (
        <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Switch
            label={r.isActive ? "Active" : "Inactive"}
            checked={r.isActive}
            disabled={r.isActive ? !peutSuspendre : !peutActiver}
            aria-label={`${r.isActive ? "Suspendre" : "Activer"} la règle ${r.label ?? r.code}`}
            onCheckedChange={(actif) =>
              void operation.executer("etat", () => basculer({ ruleId: r._id, isActive: actif }), `${r.label ?? r.code} : ${actif ? "active, appliquée dès maintenant" : "suspendue"}.`)
            }
            className="text-[13px]"
          />
        </span>
      ),
      export: false,
    },
  ]

  return (
    <CadreGestion
      surtitre="Commercial · tarification dynamique"
      titre="Yield management"
      description="Le prix suit l'anticipation, le remplissage et la période. Chaque règle a un plancher et un plafond ; le guichet et la vente en ligne appliquent le même prix au même instant."
      lectureSeule={!droits.chargement && !peutActiver ? mentionLectureSeule(droits.role, "les règles de yield") : undefined}
      actions={
        droits.may("yield", "creer") ? (
          <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
            <Plus />
            Nouvelle règle
          </Button>
        ) : null
      }
    >
      <Indicateurs>
        <Indicateur
          libelle="Recette par siège · 30 j"
          icone={Armchair}
          valeur={indicateurs ? montant(indicateurs.courant.recetteParSiege) : "…"}
          unite="XAF"
          evolution={indicateurs ? (evolution(indicateurs.courant.recetteParSiege, indicateurs.precedent.recetteParSiege) ?? { sens: "neutre", texte: `${nombre(indicateurs.courant.dessertes)} dessertes clôturées` }) : undefined}
        />
        <Indicateur
          libelle="Remplissage moyen"
          icone={Users}
          valeur={indicateurs ? pourcent(indicateurs.courant.remplissage) : "…"}
          remplissage={indicateurs?.courant.remplissage ?? undefined}
          evolution={{ sens: "neutre", texte: "en sièges-kilomètres" }}
        />
        <Indicateur
          libelle="Recette par trajet"
          icone={RouteIcon}
          valeur={indicateurs ? millions(indicateurs.courant.recetteParDesserte) : "…"}
          unite="XAF"
          evolution={indicateurs ? evolution(indicateurs.courant.recetteParDesserte, indicateurs.precedent.recetteParDesserte) : undefined}
        />
        <Indicateur libelle="Règles actives" icone={SlidersHorizontal} valeur={indicateurs ? indicateurs.reglesActives : "…"} unite={indicateurs ? `/ ${indicateurs.reglesTotal}` : undefined} />
      </Indicateurs>
      {indicateurs && indicateurs.courant.dessertes === 0 ? (
        <InlineMessage tone="info" title="Aucune desserte clôturée sur 30 jours.">
          Recette et remplissage se calculent à la clôture des journées comptables.
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)] [&>*:nth-child(2)]:content-start">
        <PanneauCourbe />
      </div>

      <RetourOperation retour={operation.retour} />
      <TableauDonnees
        libelle="Règles de yield"
        colonnes={colonnes}
        lignes={regles?.filter((r) => etat === "toutes" || r.etat === etat)}
        cle={(r) => r._id}
        lien={(r) => `/gestion/yield/${r._id}`}
        recherche={{ placeholder: "Règle, code…", texte: (r) => `${r.label ?? ""} ${r.code ?? ""} ${declencheur(r)}` }}
        filtres={
          <SelectFiltre libelle="État des règles" value={etat} onChange={setEtat}>
            <option value="toutes">Toutes les règles</option>
            {Object.entries(ETATS_REGLE).map(([cle, def]) => (
              <option key={cle} value={cle}>
                {def.libelle}
              </option>
            ))}
          </SelectFiltre>
        }
        exportNom="regles-yield"
        triInitial={{ cle: "etat", sens: "asc" }}
        vide={{ titre: "Aucune règle", description: "Sans règle, le prix de vente est celui de la grille." }}
      />
      <DialogueRegle open={creation} onOpenChange={setCreation} />
    </CadreGestion>
  )
}
