"use client"

import type { FunctionReturnType } from "convex/server"
import {
  BadgeCheck,
  BadgePercent,
  Calculator,
  Clock,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Tags,
  Trash2,
  X,
} from "lucide-react"
import { useMemo, useState, type ChangeEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { Fiche, Panneau, suffixeDate, telechargerCsv } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { Historique, Onglets, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import {
  agent,
  champDate,
  CLASSES,
  dateCourte,
  dateHeure,
  debutJour,
  finJour,
  JOURS_LONGS,
  montant,
  nombre,
  ORDRE_CLASSES,
  ORDRE_TYPES_TRAIN,
  signePct,
  taux,
  TYPES_TRAIN,
  type ClasseService,
  type TypeTrain,
} from "./gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi } from "./gestion/referentiels/formulaire"
import { CycleVie, TagApprobation } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

export type DossierGrille = NonNullable<FunctionReturnType<typeof api.functions.referentiels.grilleTarifaire>>
type Base = { trainType: TypeTrain; serviceClass: ClasseService; shortDistanceRate: number; longDistanceRate: number }
type Reduction = DossierGrille["discounts"][number]

export const ETAPES_GRILLE = ["Brouillon", "Soumise", "Approuvée", "Active"] as const

/** Étape du cycle : une grille approuvée dont l'effet est futur n'est pas encore active. */
export function etapeGrille(schedule: { status: DossierGrille["schedule"]["status"]; validFrom: number }, maintenant = Date.now()) {
  switch (schedule.status) {
    case "brouillon":
    case "rejete":
      return 0
    case "a_valider":
      return 1
    case "actif":
      return schedule.validFrom > maintenant ? 2 : 3
    case "expire":
      return 4
  }
}

/* ============================================================ Grille */

const TRANCHES = [
  { cle: "shortDistanceRate", libelle: "0–99 km" },
  { cle: "longDistanceRate", libelle: "100 km et plus" },
] as const
type Tranche = (typeof TRANCHES)[number]["cle"]

type Saisie = Record<string, string>
const cle = (type: TypeTrain, classe: ClasseService, tranche: Tranche) => `${type}|${classe}|${tranche}`

function versSaisie(bases: readonly Base[]): Saisie {
  const saisie: Saisie = {}
  for (const base of bases) {
    for (const tranche of TRANCHES) saisie[cle(base.trainType, base.serviceClass, tranche.cle)] = taux(base[tranche.cle])
  }
  return saisie
}

const lireTaux = (valeur: string | undefined) => {
  if (!valeur?.trim()) return undefined
  const n = Number(valeur.replace(/\s/g, "").replace(",", "."))
  return Number.isFinite(n) ? n : Number.NaN
}

/** Saisie → bases complètes ; lève une erreur écrite pour une cellule seule ou illisible. */
function versBases(saisie: Saisie, types: readonly TypeTrain[]): Base[] {
  const bases: Base[] = []
  for (const type of types) {
    for (const classe of ORDRE_CLASSES) {
      const court = lireTaux(saisie[cle(type, classe, "shortDistanceRate")])
      const long = lireTaux(saisie[cle(type, classe, "longDistanceRate")])
      if (court === undefined && long === undefined) continue
      if (court === undefined || long === undefined) {
        throw new Error(`${TYPES_TRAIN[type]} ${CLASSES[classe].court} : renseignez les deux tranches, ou aucune.`)
      }
      if (Number.isNaN(court) || Number.isNaN(long) || court <= 0 || long <= 0) {
        throw new Error(`${TYPES_TRAIN[type]} ${CLASSES[classe].court} : taux illisible ou nul.`)
      }
      bases.push({ trainType: type, serviceClass: classe, shortDistanceRate: court, longDistanceRate: long })
    }
  }
  return bases
}

/** Lit une grille CSV : type ; classe ; taux 0–99 km ; taux 100 km et plus. */
export function lireGrilleCsv(contenu: string): Base[] {
  const types: Record<string, TypeTrain> = { express: "EXPRESS", omnibus: "OMNIBUS", autorail: "AUTORAIL", special: "SPECIAL", spécial: "SPECIAL" }
  const classes: Record<string, ClasseService> = { vip: "VIP", "1re": "PREMIERE", premiere: "PREMIERE", première: "PREMIERE", "2e": "DEUXIEME", deuxieme: "DEUXIEME", deuxième: "DEUXIEME" }
  const lignes = contenu.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim())
  const bases: Base[] = []
  lignes.forEach((ligne, index) => {
    const cellules = ligne.split(";").map((c) => c.trim().replace(/^"|"$/g, ""))
    const type = types[cellules[0]?.toLowerCase() ?? ""] ?? (ORDRE_TYPES_TRAIN.includes(cellules[0] as TypeTrain) ? (cellules[0] as TypeTrain) : undefined)
    const classe = classes[cellules[1]?.toLowerCase() ?? ""] ?? (ORDRE_CLASSES.includes(cellules[1] as ClasseService) ? (cellules[1] as ClasseService) : undefined)
    if (!type || !classe) {
      if (index === 0) return // en-tête
      throw new Error(`Ligne ${index + 1} : type de train ou classe inconnus.`)
    }
    const court = lireTaux(cellules[2])
    const long = lireTaux(cellules[3])
    if (!court || !long || Number.isNaN(court) || Number.isNaN(long)) throw new Error(`Ligne ${index + 1} : taux illisibles.`)
    bases.push({ trainType: type, serviceClass: classe, shortDistanceRate: court, longDistanceRate: long })
  })
  if (bases.length === 0) throw new Error("Aucune base lue dans le fichier.")
  return bases
}

export function exporterGrille(label: string, bases: readonly Base[]) {
  telechargerCsv(
    `grille-${label.replace(/\W+/g, "-").toLowerCase()}-${suffixeDate()}`,
    [
      { libelle: "Type de train", valeur: (b: Base) => TYPES_TRAIN[b.trainType] },
      { libelle: "Classe", valeur: (b: Base) => CLASSES[b.serviceClass].court },
      { libelle: "Taux 0-99 km (XAF/km HT)", valeur: (b: Base) => b.shortDistanceRate },
      { libelle: "Taux 100 km et plus (XAF/km HT)", valeur: (b: Base) => b.longDistanceRate },
    ],
    bases
  )
}

/**
 * Grille kilométrique : types de train × tranches en lignes, classes en
 * colonnes. Une valeur qui diffère de la grille de référence porte l'ancienne
 * valeur barrée au-dessus d'elle, et le mot « avant » pour les lecteurs d'écran.
 */
export function GrilleKilometrique({
  bases,
  reference,
  edition,
}: {
  bases: readonly Base[]
  reference: readonly Base[] | null
  edition?: { saisie: Saisie; changer: (cle: string, valeur: string) => void; types: readonly TypeTrain[] }
}) {
  const types = edition?.types ?? ORDRE_TYPES_TRAIN.filter((t) => bases.some((b) => b.trainType === t) || reference?.some((b) => b.trainType === t))
  const valeurDe = (source: readonly Base[] | null, type: TypeTrain, classe: ClasseService, tranche: Tranche) =>
    source?.find((b) => b.trainType === type && b.serviceClass === classe)?.[tranche]
  const classes = ORDRE_CLASSES.filter((c) => edition || bases.some((b) => b.serviceClass === c) || reference?.some((b) => b.serviceClass === c))
  if (types.length === 0) return <p className="text-small p-4 text-ink-muted">Grille vide : aucune base kilométrique.</p>
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" aria-label="Grille kilométrique, XAF par kilomètre hors taxes">
        <thead>
          <tr className="bg-surface-sunk text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
            <th scope="col" className="px-3.5 py-2.5 text-left">Train · tranche</th>
            {classes.map((classe) => (
              <th key={classe} scope="col" className="px-3.5 py-2.5 text-right">
                {CLASSES[classe].long}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.flatMap((type) =>
            TRANCHES.map((tranche) => (
              <tr key={`${type}-${tranche.cle}`} className="border-t border-line">
                <th scope="row" className="px-3.5 py-2 text-left font-medium">
                  {TYPES_TRAIN[type]} · <span className="tabular-nums">{tranche.libelle}</span>
                </th>
                {classes.map((classe) => {
                  const avant = valeurDe(reference, type, classe, tranche.cle)
                  if (edition) {
                    const k = cle(type, classe, tranche.cle)
                    const saisi = lireTaux(edition.saisie[k])
                    const change = reference !== null && saisi !== avant && !(saisi === undefined && avant === undefined)
                    return (
                      <td key={classe} className={cn("px-2 py-1.5 text-right", change && "bg-warning-soft")}>
                        {change && avant !== undefined ? (
                          <span className="tabular block text-[11.5px] text-ink-faint line-through">
                            <span className="sr-only">avant </span>
                            {taux(avant)}
                          </span>
                        ) : null}
                        <input
                          aria-label={`${TYPES_TRAIN[type]} ${tranche.libelle}, ${CLASSES[classe].long}`}
                          inputMode="decimal"
                          value={edition.saisie[k] ?? ""}
                          onChange={(event) => edition.changer(k, event.target.value)}
                          placeholder="—"
                          className={cn(
                            "tabular h-11 w-24 rounded-md border border-line-strong bg-surface px-2 text-right text-[14px] outline-none focus:border-accent-base",
                            change && "font-bold"
                          )}
                        />
                      </td>
                    )
                  }
                  const valeur = valeurDe(bases, type, classe, tranche.cle)
                  const change = reference !== null && valeur !== avant
                  return (
                    <td key={classe} className={cn("tabular px-3.5 py-2 text-right", change && "bg-warning-soft font-bold")}>
                      {change && avant !== undefined ? (
                        <span className="block text-[11.5px] font-normal text-ink-faint line-through">
                          <span className="sr-only">avant </span>
                          {taux(avant)}
                        </span>
                      ) : null}
                      {valeur === undefined ? "—" : taux(valeur)}
                      {change ? <span className="sr-only"> (modifié)</span> : null}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Édition de la grille d'une version en brouillon, enregistrée d'un bloc. */
function EditionGrille({ dossier }: { dossier: DossierGrille }) {
  const enregistrer = useMutation(api.functions.referentiels.enregistrerGrille)
  const operation = useOperation()
  const initiale = useMemo(() => versSaisie(dossier.bases), [dossier.bases])
  const [saisie, setSaisie] = useState<Saisie>(initiale)
  const [types, setTypes] = useState<TypeTrain[]>(() =>
    ORDRE_TYPES_TRAIN.filter((t) => dossier.bases.some((b) => b.trainType === t) || dossier.reference?.bases.some((b) => b.trainType === t))
  )
  const modifiees = Object.keys({ ...initiale, ...saisie }).filter((k) => (initiale[k] ?? "") !== (saisie[k] ?? "")).length
  const manquants = ORDRE_TYPES_TRAIN.filter((t) => !types.includes(t))
  const importer = async (event: ChangeEvent<HTMLInputElement>) => {
    const fichier = event.target.files?.[0]
    event.target.value = ""
    if (!fichier) return
    try {
      const bases = lireGrilleCsv(await fichier.text())
      setSaisie(versSaisie(bases))
      setTypes(ORDRE_TYPES_TRAIN.filter((t) => bases.some((b) => b.trainType === t)))
      operation.signaler({ ton: "success", titre: `${fichier.name} : ${bases.length} bases lues`, detail: "Vérifiez les valeurs surlignées, puis enregistrez la grille." })
    } catch (cause) {
      operation.signaler({ ton: "danger", titre: "Import impossible", detail: cause instanceof Error ? cause.message : undefined })
    }
  }
  return (
    <div className="grid gap-3">
      <GrilleKilometrique bases={dossier.bases} reference={dossier.reference?.bases ?? null} edition={{ saisie, types, changer: (k, v) => setSaisie((s) => ({ ...s, [k]: v })) }} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <RetourOperation retour={operation.retour} />
        {manquants.length > 0 ? (
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <span className="text-ink-muted">Ajouter</span>
            <select
              value=""
              onChange={(event) => event.target.value && setTypes((t) => ORDRE_TYPES_TRAIN.filter((x) => t.includes(x) || x === event.target.value))}
              className="min-h-11 rounded-md border border-line-strong bg-surface px-3"
            >
              <option value="">un type de train…</option>
              {manquants.map((t) => (
                <option key={t} value={t}>
                  {TYPES_TRAIN[t]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill px-4 text-[14px] font-semibold text-accent-ink hover:bg-accent-soft focus-within:shadow-[var(--focus-ring)]">
          <FileSpreadsheet aria-hidden className="size-[18px]" />
          Importer un CSV
          <input type="file" accept=".csv,text/csv" onChange={importer} className="sr-only" />
        </label>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={modifiees === 0} onClick={() => setSaisie(initiale)}>
            <RotateCcw />
            Annuler les modifications
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={modifiees === 0}
            loading={operation.enCours === "grille"}
            loadingLabel="Enregistrement…"
            onClick={async () => {
              let bases: Base[]
              try {
                bases = versBases(saisie, types)
              } catch (cause) {
                operation.signaler({ ton: "danger", titre: "Grille incomplète", detail: cause instanceof Error ? cause.message : undefined })
                return
              }
              await operation.executer("grille", () => enregistrer({ scheduleId: dossier.schedule._id, bases }), (r) => `Grille enregistrée · ${r.modifiees} valeur(s) différente(s) de la référence.`)
            }}
          >
            <Save />
            Enregistrer {modifiees > 0 ? `(${modifiees})` : ""}
          </Button>
        </span>
      </div>
    </div>
  )
}

/* ========================================================= Simulateur */

export function Simulateur({ scheduleId, discounts }: { scheduleId?: string; discounts: readonly { code: string; label: string; ratePct: number; isActive: boolean }[] }) {
  const stations = useQuery(api.functions.referential.listStations, {})
  const [etat, setEtat] = useState({
    origine: "",
    destination: "",
    trainType: "EXPRESS" as TypeTrain,
    classe: "DEUXIEME" as ClasseService,
    reduction: "",
    jours: "10",
    semaine: "5",
    remplissage: "60",
    canal: "guichet" as "guichet" | "ligne",
  })
  const origine = etat.origine || stations?.[0]?._id || ""
  const destination = etat.destination || stations?.[stations.length - 1]?._id || ""
  const resultat = useQuery(
    api.functions.referentiels.simulerPrix,
    origine && destination
      ? {
          scheduleId: scheduleId as never,
          originStationId: origine as never,
          destinationStationId: destination as never,
          trainType: etat.trainType,
          serviceClass: etat.classe,
          discountCode: etat.reduction || undefined,
          joursAvantDepart: Number(etat.jours) || 0,
          jourSemaine: Number(etat.semaine) || 0,
          remplissagePct: Number(etat.remplissage) || 0,
          canal: etat.canal,
        }
      : "skip"
  )
  const changer = (champ: keyof typeof etat) => (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setEtat((e) => ({ ...e, [champ]: event.target.value }))
  const ligne = (libelle: string, valeur: string, fort?: boolean) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[14px]", fort && "border-t border-line-strong pt-2.5 text-[16px] font-bold")}>
      <span className={cn(!fort && "text-ink-muted")}>{libelle}</span>
      <span className="tabular whitespace-nowrap">{valeur}</span>
    </div>
  )
  return (
    <Panneau titre="Simulateur" icone={Calculator} sousTitre="le calcul de la vente, pas à pas">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="De" htmlFor="sim-de">
          <SelectNative id="sim-de" value={origine} onChange={changer("origine")}>
            {stations?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="À" htmlFor="sim-a">
          <SelectNative id="sim-a" value={destination} onChange={changer("destination")}>
            {stations?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Train" htmlFor="sim-train">
          <SelectNative id="sim-train" value={etat.trainType} onChange={changer("trainType")}>
            {ORDRE_TYPES_TRAIN.map((t) => (
              <option key={t} value={t}>
                {TYPES_TRAIN[t]}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Classe" htmlFor="sim-classe">
          <SelectNative id="sim-classe" value={etat.classe} onChange={changer("classe")}>
            {ORDRE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CLASSES[c].long}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Réduction" htmlFor="sim-reduction">
          <SelectNative id="sim-reduction" value={etat.reduction} onChange={changer("reduction")}>
            <option value="">Plein tarif</option>
            {discounts.filter((d) => d.isActive).map((d) => (
              <option key={d.code} value={d.code}>
                {d.label} · −{d.ratePct} %
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Canal" htmlFor="sim-canal">
          <SelectNative id="sim-canal" value={etat.canal} onChange={changer("canal")}>
            <option value="guichet">Guichet</option>
            <option value="ligne">Vente en ligne</option>
          </SelectNative>
        </Field>
        <Field label="Jours avant le départ" htmlFor="sim-jours">
          <Input id="sim-jours" type="number" min="0" max="365" inputMode="numeric" value={etat.jours} onChange={changer("jours")} className="tabular" />
        </Field>
        <Field label="Jour du départ" htmlFor="sim-semaine">
          <SelectNative id="sim-semaine" value={etat.semaine} onChange={changer("semaine")}>
            {[1, 2, 3, 4, 5, 6, 0].map((j) => (
              <option key={j} value={j}>
                {JOURS_LONGS[j]}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Remplissage de la classe (%)" htmlFor="sim-remplissage" className="sm:col-span-2">
          <Input id="sim-remplissage" type="number" min="0" max="100" inputMode="numeric" value={etat.remplissage} onChange={changer("remplissage")} className="tabular" />
        </Field>
      </div>
      {resultat === undefined ? (
        <SkeletonLines />
      ) : !resultat.ok ? (
        <InlineMessage tone="warning" title="Simulation impossible">
          {resultat.message}
        </InlineMessage>
      ) : (
        <div className="rounded-md border border-line bg-surface-sunk px-4 py-2" aria-live="polite">
          {ligne(`${nombre(resultat.chargeableKm)} km × ${taux(resultat.ratePerKm)}`, montant(resultat.brut))}
          {resultat.reduction ? ligne(`${resultat.reduction.label} · −${resultat.reduction.ratePct} %`, `−${montant(resultat.reduction.montant)}`) : null}
          {resultat.vatPct || resultat.cssPct ? ligne(`TVA ${resultat.vatPct} % · CSS ${resultat.cssPct} %`, `+${montant(resultat.vat + resultat.css)}`) : null}
          {ligne(
            `Arrondi ${resultat.roundingBasis} · ${resultat.distanceKm < 100 ? "moins de 100 km" : resultat.distanceKm < 300 ? "100 à 299 km" : "300 km et plus"}, à ${resultat.roundingStep} près`,
            montant(resultat.prixGrille)
          )}
          {resultat.regles.map((regle) => ligne(`Yield · ${regle.label ?? regle.code} ${signePct(regle.modifierPct)}`, ""))}
          {resultat.regles.length > 0 ? ligne(`Yield cumulé ${signePct(resultat.totalModifierPct)}${resultat.borne ? " · borné" : ""}`, "") : ligne("Aucune règle de yield ne s'applique", "")}
          {ligne("Prix affiché", `${montant(resultat.prixFinal)} XAF`, true)}
          <p className="pb-1 text-[12.5px] text-ink-muted">
            Barème « {resultat.grille.label} » · {resultat.origine} → {resultat.destination}, {nombre(resultat.distanceKm)} km. Même prix au guichet et en ligne au même instant.
          </p>
        </div>
      )}
    </Panneau>
  )
}

/* ========================================================= Réductions */

interface ReductionAffichee {
  _id?: string
  code: string
  label: string
  ratePct: number
  minAge?: number | null
  maxAge?: number | null
  minPassengers?: number | null
  maxPassengers?: number | null
  requiresProof: boolean
  isActive?: boolean
}

export function TableReductions<R extends ReductionAffichee>({ discounts, edition }: { discounts: readonly R[]; edition?: { onModifier: (d: R) => void; onSupprimer?: (d: R) => void } }) {
  if (discounts.length === 0) return <p className="text-small p-4 text-ink-muted">Aucune réduction dans cette grille.</p>
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" aria-label="Réductions">
        <thead>
          <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
            <th scope="col" className="px-3.5 py-2.5">Catégorie</th>
            <th scope="col" className="px-3.5 py-2.5 text-right">Remise</th>
            <th scope="col" className="hidden px-3.5 py-2.5 sm:table-cell">Conditions</th>
            {edition ? <th scope="col" className="px-3.5 py-2.5"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {discounts.map((d) => (
            <tr key={d._id ?? d.code} className="border-t border-line">
              <td className="px-3.5 py-2">
                <span className="font-semibold">{d.label}</span>
                <small className="tabular block text-[12px] text-ink-muted">
                  {d.code}
                  {d.isActive === false ? " · désactivée" : ""}
                </small>
              </td>
              <td className="tabular px-3.5 py-2 text-right">−{d.ratePct} %</td>
              <td className="hidden px-3.5 py-2 text-[13px] text-ink-muted sm:table-cell">
                {[
                  d.minAge != null || d.maxAge != null ? `${d.minAge ?? 0}–${d.maxAge ?? "…"} ans` : null,
                  d.minPassengers != null || d.maxPassengers != null ? `${d.minPassengers ?? 1} à ${d.maxPassengers ?? "…"} voyageurs` : null,
                  d.requiresProof ? "justificatif exigé" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
              {edition ? (
                <td className="px-3.5 py-2 text-right whitespace-nowrap">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Modifier ${d.label}`} onClick={() => edition.onModifier(d)}>
                    <Pencil />
                  </Button>
                  {edition.onSupprimer ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Retirer ${d.label}`} onClick={() => edition.onSupprimer?.(d)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DialogueReduction({ scheduleId, reduction, onClose }: { scheduleId: string; reduction?: Reduction; onClose: () => void }) {
  const enregistrer = useMutation(api.functions.referentiels.enregistrerReduction)
  const operation = useOperation()
  const [active, setActive] = useState(reduction?.isActive ?? true)
  const [justificatif, setJustificatif] = useState(reduction?.requiresProof ?? false)
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre={reduction ? `Modifier « ${reduction.label} »` : "Nouvelle réduction"}
      libelleValider={reduction ? "Enregistrer" : (<><Plus />Ajouter la réduction</>)}
      enCours={operation.enCours === "reduction"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const ok = await operation.executer("reduction", () =>
          enregistrer({
            scheduleId: scheduleId as never,
            discountId: reduction?._id,
            code: String(donnees.get("code") ?? ""),
            label: String(donnees.get("label") ?? ""),
            ratePct: nombreSaisi(donnees, "ratePct") ?? Number.NaN,
            minAge: nombreSaisi(donnees, "minAge"),
            maxAge: nombreSaisi(donnees, "maxAge"),
            minPassengers: nombreSaisi(donnees, "minPassengers"),
            maxPassengers: nombreSaisi(donnees, "maxPassengers"),
            requiresProof: justificatif,
            isActive: active,
          })
        )
        if (ok) onClose()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Code" htmlFor="red-code">
          <Input id="red-code" name="code" defaultValue={reduction?.code} placeholder="ENFANT" required className="tabular uppercase" />
        </Field>
        <Field label="Libellé" htmlFor="red-label">
          <Input id="red-label" name="label" defaultValue={reduction?.label} placeholder="Enfant 4–11 ans" required />
        </Field>
      </div>
      <Field label="Remise (%)" htmlFor="red-taux">
        <Input id="red-taux" name="ratePct" inputMode="decimal" defaultValue={reduction?.ratePct} required className="tabular" />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Âge min." htmlFor="red-amin">
          <Input id="red-amin" name="minAge" inputMode="numeric" defaultValue={reduction?.minAge} className="tabular" />
        </Field>
        <Field label="Âge max." htmlFor="red-amax">
          <Input id="red-amax" name="maxAge" inputMode="numeric" defaultValue={reduction?.maxAge} className="tabular" />
        </Field>
        <Field label="Voyageurs min." htmlFor="red-pmin">
          <Input id="red-pmin" name="minPassengers" inputMode="numeric" defaultValue={reduction?.minPassengers} className="tabular" />
        </Field>
        <Field label="Voyageurs max." htmlFor="red-pmax">
          <Input id="red-pmax" name="maxPassengers" inputMode="numeric" defaultValue={reduction?.maxPassengers} className="tabular" />
        </Field>
      </div>
      <Switch label="Justificatif exigé au guichet" checked={justificatif} onCheckedChange={setJustificatif} />
      <Switch label="Réduction proposée à la vente" checked={active} onCheckedChange={setActive} />
    </FenetreFormulaire>
  )
}

/* ============================================================ Décision */

/** Actions du cycle d'une grille : soumettre, approuver (second administrateur), refuser, expirer. */
export function useDecisionGrille(dossier: DossierGrille | null | undefined) {
  const droits = useDroitsGestion()
  const operation = useOperation()
  const submit = useMutation(api.functions.fareSchedules.submit)
  const approve = useMutation(api.functions.fareSchedules.approve)
  const reject = useMutation(api.functions.fareSchedules.reject)
  const expire = useMutation(api.functions.fareSchedules.expire)
  const [refus, setRefus] = useState(false)
  const status = dossier?.schedule.status
  const editable = status === "brouillon" || status === "rejete"
  const peut = {
    modifier: editable && droits.may("tarifs", "modifier"),
    soumettre: editable && droits.may("tarifs", "modifier"),
    decider: status === "a_valider" && droits.may("tarifs", "valider"),
    approuver: status === "a_valider" && droits.may("tarifs", "valider") && !dossier?.estAuteur,
    expirer: status === "actif" && droits.may("tarifs", "valider"),
  }
  const boutons = () =>
    dossier ? (
      <>
        {peut.expirer ? (
          <Button
            type="button"
            variant="ghost"
            loading={operation.enCours === "expirer"}
            onClick={() => {
              if (window.confirm("Expirer cette grille ? Elle reste consultable ; la vente passera sur la grille suivante approuvée.")) {
                void operation.executer("expirer", () => expire({ scheduleId: dossier.schedule._id }), "Grille expirée : elle reste consultable pour l'historique.")
              }
            }}
          >
            <Clock />
            Expirer
          </Button>
        ) : null}
        {peut.soumettre ? (
          <Button type="button" loading={operation.enCours === "soumettre"} loadingLabel="Soumission…" disabled={dossier.bases.length === 0} onClick={() => void operation.executer("soumettre", () => submit({ scheduleId: dossier.schedule._id }), "Grille soumise : un second administrateur doit l'approuver.")}>
            <Send />
            Soumettre à approbation
          </Button>
        ) : null}
        {peut.decider ? (
          <>
            <Button type="button" variant="danger" onClick={() => setRefus(true)}>
              <X />
              Refuser
            </Button>
            <Button
              type="button"
              disabled={!peut.approuver}
              loading={operation.enCours === "approuver"}
              loadingLabel="Approbation…"
              onClick={() =>
                void operation.executer(
                  "approuver",
                  () => approve({ scheduleId: dossier.schedule._id }),
                  `Grille « ${dossier.schedule.label} » approuvée · active le ${dateCourte(dossier.schedule.validFrom)}.`
                )
              }
            >
              <BadgeCheck />
              Approuver la grille
            </Button>
          </>
        ) : null}
      </>
    ) : null
  const dialogueRefus = dossier ? (
    <FenetreFormulaire
      open={refus}
      onOpenChange={setRefus}
      titre={`Refuser « ${dossier.schedule.label} »`}
      description="La grille revient à son auteur pour correction. Le motif reste au journal."
      variante="danger"
      libelleValider={
        <>
          <X />
          Refuser la grille
        </>
      }
      enCours={operation.enCours === "refuser"}
      onSubmit={async (donnees) => {
        const ok = await operation.executer("refuser", () => reject({ scheduleId: dossier.schedule._id, reason: String(donnees.get("motif") ?? "") }), "Grille refusée : le motif est transmis à son auteur.")
        if (ok) setRefus(false)
      }}
    >
      <Field label="Motif du refus" htmlFor="grille-refus">
        <Textarea id="grille-refus" name="motif" required minLength={5} placeholder="Autorail 1re : hausse de 3 % non validée par la direction commerciale." />
      </Field>
    </FenetreFormulaire>
  ) : null
  return { droits, operation, peut, boutons, dialogueRefus }
}

export function MentionAuteur({ dossier }: { dossier: DossierGrille }) {
  const { schedule } = dossier
  return (
    <span>
      {dossier.modifiees > 0 ? `${dossier.modifiees} valeur(s) modifiée(s) · ` : ""}
      {schedule.status === "actif" || schedule.status === "expire" ? (
        <>
          approuvée par <b>{agent(dossier.approuvePar)}</b> le <span className="tabular">{dateHeure(schedule.approvedAt)}</span>
        </>
      ) : schedule.submittedAt ? (
        <>
          soumise par <b>{agent(dossier.soumisPar)}</b> le <span className="tabular">{dateHeure(schedule.submittedAt)}</span>
        </>
      ) : (
        <>
          créée par <b>{agent(dossier.creePar)}</b>
        </>
      )}
    </span>
  )
}

export function AvisSeparation({ dossier, peutDecider }: { dossier: DossierGrille; peutDecider: boolean }) {
  if (!peutDecider || !dossier.estAuteur) return null
  return (
    <InlineMessage tone="info" title="Un second administrateur doit approuver.">
      Vous avez rédigé ou soumis cette grille : son approbation revient à un autre administrateur. Vous pouvez encore la refuser pour la reprendre.
    </InlineMessage>
  )
}

/* ============================================================== Dossier */

function DialogueParametres({ dossier, onClose }: { dossier: DossierGrille; onClose: () => void }) {
  const update = useMutation(api.functions.fareSchedules.update)
  const operation = useOperation()
  const { schedule } = dossier
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre="Paramètres de la grille"
      libelleValider="Enregistrer"
      enCours={operation.enCours === "parametres"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const ok = await operation.executer("parametres", () =>
          update({
            scheduleId: schedule._id,
            label: String(donnees.get("label") ?? ""),
            validFrom: debutJour(String(donnees.get("validFrom"))),
            validUntil: finJour(String(donnees.get("validUntil"))),
            roundingBasis: String(donnees.get("roundingBasis")) as "HT" | "TTC",
            vatPct: nombreSaisi(donnees, "vatPct") ?? 0,
            cssPct: nombreSaisi(donnees, "cssPct") ?? 0,
          })
        )
        if (ok) onClose()
      }}
    >
      <ChampsGrille valeurs={schedule} />
    </FenetreFormulaire>
  )
}

export function ChampsGrille({ valeurs }: { valeurs?: { label: string; validFrom: number; validUntil: number; roundingBasis: "HT" | "TTC"; vatPct: number; cssPct: number } }) {
  return (
    <>
      <Field label="Libellé" htmlFor="grille-label">
        <Input id="grille-label" name="label" defaultValue={valeurs?.label} placeholder="Grille 2026-2" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Application au" htmlFor="grille-debut">
          <Input id="grille-debut" name="validFrom" type="date" defaultValue={champDate(valeurs?.validFrom)} required />
        </Field>
        <Field label="Jusqu'au" htmlFor="grille-fin">
          <Input id="grille-fin" name="validUntil" type="date" defaultValue={champDate(valeurs?.validUntil)} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Arrondi sur" htmlFor="grille-arrondi">
          <SelectNative id="grille-arrondi" name="roundingBasis" defaultValue={valeurs?.roundingBasis ?? "TTC"}>
            <option value="TTC">TTC (prix payé)</option>
            <option value="HT">HT</option>
          </SelectNative>
        </Field>
        <Field label="TVA (%)" htmlFor="grille-tva">
          <Input id="grille-tva" name="vatPct" inputMode="decimal" defaultValue={valeurs?.vatPct ?? 18} required className="tabular" />
        </Field>
        <Field label="CSS (%)" htmlFor="grille-css">
          <Input id="grille-css" name="cssPct" inputMode="decimal" defaultValue={valeurs?.cssPct ?? 0} required className="tabular" />
        </Field>
      </div>
    </>
  )
}

export function FareScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const dossier = useQuery(api.functions.referentiels.grilleTarifaire, { scheduleId: scheduleId as never })
  const decision = useDecisionGrille(dossier)
  const supprimerReduction = useMutation(api.functions.referentiels.supprimerReduction)
  const [onglet, setOnglet] = useState<"grille" | "reductions" | "historique">("grille")
  const [parametres, setParametres] = useState(false)
  const [reduction, setReduction] = useState<Reduction | "nouvelle" | null>(null)
  const { operation, peut, droits } = decision

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Grille introuvable" : "Grille tarifaire"} eyebrow="Commercial · tarification" backHref="/gestion/tarifs" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Cette grille n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { schedule } = dossier

  return (
    <ManagementDetailShell
      title={schedule.label}
      eyebrow="Commercial · tarification"
      backHref="/gestion/tarifs"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !droits.may("tarifs", "modifier") && !droits.may("tarifs", "valider")}
      description="Base kilométrique par type de train, tranche de distance et classe (XAF/km, HT). Une grille active ou expirée ne se modifie plus : toute évolution passe par une nouvelle version."
      actions={
        <>
          {peut.modifier ? (
            <Button type="button" variant="secondary" onClick={() => setParametres(true)}>
              <Pencil />
              Paramètres
            </Button>
          ) : null}
          {decision.boutons()}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <TagApprobation status={schedule.status} genre="feminin" />
        <CycleVie etapes={ETAPES_GRILLE} courante={etapeGrille(schedule)} />
      </div>
      <RetourOperation retour={operation.retour} />
      <AvisSeparation dossier={dossier} peutDecider={peut.decider} />
      {schedule.status === "rejete" && schedule.rejectionReason ? (
        <InlineMessage tone="warning" title="Refusée : à corriger avant une nouvelle soumission.">
          {schedule.rejectionReason}
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <Panneau
          plein
          titre="Grille kilométrique"
          icone={Tags}
          sousTitre={<MentionAuteur dossier={dossier} />}
          actions={
            <Button type="button" variant="ghost" size="sm" onClick={() => exporterGrille(schedule.label, dossier.bases)}>
              Exporter (CSV)
            </Button>
          }
        >
          <div className="px-4 pt-2">
            <Onglets
              libelle="Contenu de la grille"
              valeur={onglet}
              onChange={setOnglet}
              onglets={[
                { cle: "grille", libelle: "Grille kilométrique" },
                { cle: "reductions", libelle: "Réductions", compte: dossier.discounts.length },
                { cle: "historique", libelle: "Historique", compte: dossier.historique.length },
              ]}
            />
          </div>
          <div role="tabpanel">
            {onglet === "grille" ? (
              <div className="grid gap-2 pt-2">
                {dossier.reference ? (
                  <p className="px-4 text-[12.5px] text-ink-muted">
                    Comparée à « {dossier.reference.label} » : une valeur surlignée diffère, l’ancienne est barrée au-dessus.
                  </p>
                ) : null}
                {peut.modifier ? (
                  <EditionGrille key={dossier.bases.map((b) => `${b._id}${b.shortDistanceRate}${b.longDistanceRate}`).join()} dossier={dossier} />
                ) : (
                  <GrilleKilometrique bases={dossier.bases} reference={dossier.reference?.bases ?? null} />
                )}
              </div>
            ) : onglet === "reductions" ? (
              <div className="grid gap-3 pb-4">
                <TableReductions
                  discounts={dossier.discounts}
                  edition={
                    peut.modifier
                      ? {
                          onModifier: setReduction,
                          onSupprimer: droits.may("tarifs", "supprimer")
                            ? (d) => {
                                if (window.confirm(`Retirer la réduction « ${d.label} » de cette version ?`)) {
                                  void operation.executer("reduction", () => supprimerReduction({ discountId: d._id }).then(() => true), `Réduction « ${d.label} » retirée.`)
                                }
                              }
                            : undefined,
                        }
                      : undefined
                  }
                />
                {peut.modifier ? (
                  <div className="px-4">
                    <Button type="button" variant="secondary" onClick={() => setReduction("nouvelle")}>
                      <BadgePercent />
                      Ajouter une réduction
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4">
                <Historique historique={dossier.historique} />
              </div>
            )}
          </div>
        </Panneau>
        <div className="grid content-start gap-4">
          <Simulateur scheduleId={schedule._id} discounts={dossier.discounts} />
          <Panneau titre="Paramètres" icone={Tags}>
            <Fiche
              elements={[
                ["Application", <span key="a" className="tabular">{dateCourte(schedule.validFrom)} → {dateCourte(schedule.validUntil)}</span>],
                ["TVA · CSS", <span key="t" className="tabular">{schedule.vatPct} % · {schedule.cssPct} %</span>],
                ["Arrondi sur", schedule.roundingBasis],
                ["Référence", dossier.reference?.label ?? "Aucune"],
                ["Créée par", agent(dossier.creePar)],
                dossier.soumisPar ? ["Soumise par", agent(dossier.soumisPar)] : null,
                dossier.approuvePar ? ["Approuvée par", agent(dossier.approuvePar)] : null,
              ]}
            />
          </Panneau>
        </div>
      </div>
      {parametres ? <DialogueParametres dossier={dossier} onClose={() => setParametres(false)} /> : null}
      {reduction ? <DialogueReduction scheduleId={schedule._id} reduction={reduction === "nouvelle" ? undefined : reduction} onClose={() => setReduction(null)} /> : null}
      {decision.dialogueRefus}
    </ManagementDetailShell>
  )
}

