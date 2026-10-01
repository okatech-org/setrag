"use client"

import { Plus, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Voie } from "@workspace/ui/components/voie"

import { pct, xaf, xafCompact } from "../commun"
import { BAILLEURS, ORDRE_BAILLEURS, type Bailleur } from "./libelles"

/** Avancement en voie remplie, toujours suivi de son chiffre. */
export function Avancement({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <span className="grid min-w-[120px] grid-cols-[minmax(56px,1fr)_auto] items-center gap-2" title={`${libelle} : ${pct(valeur)}`}>
      <Voie rempli={Math.max(0, Math.min(1, valeur / 100))} />
      <b className="tabular text-right text-[13.5px]">{pct(valeur)}</b>
      <span className="sr-only">{libelle}</span>
    </span>
  )
}

export interface PartBailleur {
  bailleur: string
  bailleurLibelle: string
  montantFcfa: number
  partPct: number
}

/**
 * Répartition des financements par bailleur : barres CSS d'une seule teinte,
 * chaque barre écrite (montant, part), doublées d'une table repliée.
 */
export function RepartitionBailleurs({ parts, legende }: { parts: readonly PartBailleur[]; legende: string }) {
  if (parts.length === 0) return <p className="text-small text-ink-muted">Aucun financement inscrit.</p>
  const max = Math.max(...parts.map((p) => p.montantFcfa), 1)
  const total = parts.reduce((s, p) => s + p.montantFcfa, 0)
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2.5" aria-label={legende}>
        {parts.map((p) => (
          <li key={p.bailleur} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13.5px] sm:grid-cols-[170px_minmax(0,1fr)_150px]">
            <span className="font-semibold">{p.bailleurLibelle}</span>
            <span aria-hidden className="order-last col-span-2 h-3 rounded-xs bg-surface-sunk sm:order-none sm:col-span-1">
              <span className="block h-3 rounded-xs bg-accent-base" style={{ width: `${Math.max((p.montantFcfa / max) * 100, 1)}%` }} />
            </span>
            <span className="tabular text-right">
              {xafCompact(p.montantFcfa)} · {pct(p.partPct)}
            </span>
          </li>
        ))}
      </ul>
      <details className="text-[13.5px]">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-ink">Voir le tableau : {legende.toLowerCase()}</summary>
        <table className="mt-2 w-full border-collapse">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr className="border-b border-line-strong text-left text-ink-muted">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Bailleur</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Montant</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Part</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.bailleur} className="border-b border-line">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">{p.bailleurLibelle}</th>
                <td className="tabular py-1.5 pr-3 text-right">{xaf(p.montantFcfa)}</td>
                <td className="tabular py-1.5 text-right">{pct(p.partPct)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" className="py-1.5 pr-3 text-left">Total</th>
              <td className="tabular py-1.5 pr-3 text-right">{xaf(total)}</td>
              <td className="tabular py-1.5 text-right">100 %</td>
            </tr>
          </tfoot>
        </table>
      </details>
    </div>
  )
}

/* ========================================================= Financements */

export interface LigneFinancement {
  cle: number
  bailleur: Bailleur
  montant: string
}

const lireMontant = (texte: string) => {
  const propre = texte.replace(/\s/g, "").replace(",", ".")
  if (!propre) return Number.NaN
  return Number(propre)
}

/** Lignes saisies → financements du serveur ; message d'erreur sinon. */
export function financementsSaisis(lignes: readonly LigneFinancement[]): { financements: { bailleur: Bailleur; montantFcfa: number }[] } | { erreur: string } {
  const vus = new Set<Bailleur>()
  const financements: { bailleur: Bailleur; montantFcfa: number }[] = []
  for (const [index, ligne] of lignes.entries()) {
    const montantFcfa = lireMontant(ligne.montant)
    if (!Number.isFinite(montantFcfa) || montantFcfa <= 0) return { erreur: `Le montant du financement ${index + 1} (${BAILLEURS[ligne.bailleur]}) doit être un nombre positif de XAF.` }
    if (vus.has(ligne.bailleur)) return { erreur: `${BAILLEURS[ligne.bailleur]} figure deux fois : regroupez ses apports.` }
    vus.add(ligne.bailleur)
    financements.push({ bailleur: ligne.bailleur, montantFcfa })
  }
  return { financements }
}

/** Saisie des financements par bailleur : une ligne bailleur / montant, ajout et retrait. */
export function EditeurFinancements({ lignes, onChange, budget }: { lignes: readonly LigneFinancement[]; onChange: (lignes: LigneFinancement[]) => void; budget: number | null }) {
  const total = lignes.reduce((s, l) => s + (Number.isFinite(lireMontant(l.montant)) ? lireMontant(l.montant) : 0), 0)
  const libres = ORDRE_BAILLEURS.filter((b) => !lignes.some((l) => l.bailleur === b))
  const ajouter = () => {
    const prochaine = Math.max(0, ...lignes.map((l) => l.cle)) + 1
    onChange([...lignes, { cle: prochaine, bailleur: libres[0] ?? "setrag", montant: "" }])
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-[13px] font-medium">Financements par bailleur</legend>
      {lignes.length === 0 ? <p className="text-small text-ink-muted">Aucun financement : ajoutez l&apos;apport de chaque bailleur.</p> : null}
      {lignes.map((ligne, index) => (
        <div key={ligne.cle} className="grid gap-3 rounded-md border border-line bg-surface-sunk p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field label={`Bailleur ${index + 1}`} htmlFor={`financement-bailleur-${ligne.cle}`}>
            <SelectNative
              id={`financement-bailleur-${ligne.cle}`}
              value={ligne.bailleur}
              onChange={(e) => onChange(lignes.map((l) => (l.cle === ligne.cle ? { ...l, bailleur: e.target.value as Bailleur } : l)))}
            >
              {ORDRE_BAILLEURS.map((b) => (
                <option key={b} value={b}>
                  {BAILLEURS[b]}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Montant (XAF)" htmlFor={`financement-montant-${ligne.cle}`}>
            <Input
              id={`financement-montant-${ligne.cle}`}
              inputMode="decimal"
              className="tabular"
              value={ligne.montant}
              onChange={(e) => onChange(lignes.map((l) => (l.cle === ligne.cle ? { ...l, montant: e.target.value } : l)))}
            />
          </Field>
          <Button type="button" variant="ghost" size="icon" aria-label={`Retirer le financement ${index + 1}`} onClick={() => onChange(lignes.filter((l) => l.cle !== ligne.cle))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={ajouter} disabled={libres.length === 0}>
          <Plus />
          Ajouter un financement
        </Button>
        <span className="text-small text-ink-muted">
          Total financé <b className="tabular text-ink">{xaf(total)}</b>
          {budget !== null && Number.isFinite(budget) && budget > 0 ? (
            <>
              {" "}
              sur un budget de <span className="tabular">{xaf(budget)}</span>
              {total > budget ? <b className="text-danger-ink"> : dépassement du budget</b> : total < budget ? ` · reste à financer ${xaf(budget - total)}` : " · budget entièrement financé"}
            </>
          ) : null}
        </span>
      </div>
    </fieldset>
  )
}
