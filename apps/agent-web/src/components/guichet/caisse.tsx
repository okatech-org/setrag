"use client"

import {
  ArrowDownToLine,
  Banknote,
  CircleAlert,
  CircleCheck,
  FileText,
  Lock,
  LockOpen,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Scale,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState, type ReactNode } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { EnTetePage, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import {
  dateCourte,
  dateHeure,
  heure,
  jourDeService,
  libelleMoyen,
  libelleProduit,
  montant,
  montantSigne,
  sourceRapprochement,
  xaf,
  type MoyenPaiement,
} from "@/lib/agent-data"

import { Onglets } from "@/components/gestion/referentiels/elements"

import { CadreGuichet, ChargementEcran, LimiteErreur, useGuichet } from "./cadre"
import { messageErreur, useEcriture, useLecture, type Contexte, type DetailCaisse, type SessionPassee } from "./donnees"
import { HorsReseau } from "./elements"
import { useImpression } from "./impression"

/* ════════════════════════════ Billetage ═══════════════════════════════════ */

/** Coupures du franc CFA (BEAC), billets puis pièces — même liste que le backend. */
export const COUPURES = [10_000, 5_000, 2_000, 1_000, 500, 100, 50, 25, 10, 5] as const

export type Billetage = Record<number, number>

export function totalBilletage(billetage: Billetage) {
  return COUPURES.reduce((total, c) => total + c * (billetage[c] ?? 0), 0)
}

export function lignesBilletage(billetage: Billetage) {
  return COUPURES.filter((c) => (billetage[c] ?? 0) > 0).map((c) => ({ denomination: c, count: billetage[c]! }))
}

/** Billets BEAC, puis pièces : deux colonnes, pour compter sans défiler. */
const GROUPES_COUPURES = [
  { libelle: "Billets", coupures: COUPURES.slice(0, 5) },
  { libelle: "Pièces", coupures: COUPURES.slice(5) },
] as const

function TableBilletage({ billetage, onChange, disabled }: { billetage: Billetage; onChange: (b: Billetage) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
      {GROUPES_COUPURES.map((groupe) => (
        <div key={groupe.libelle} className="grid content-start gap-1">
          <h3 className="text-[11px] font-semibold tracking-[0.07em] text-ink-faint uppercase">{groupe.libelle}</h3>
          <ColonneBilletage coupures={groupe.coupures} libelle={groupe.libelle} billetage={billetage} onChange={onChange} disabled={disabled} />
        </div>
      ))}
    </div>
  )
}

function ColonneBilletage({
  coupures,
  libelle,
  billetage,
  onChange,
  disabled,
}: {
  coupures: readonly number[]
  libelle: string
  billetage: Billetage
  onChange: (b: Billetage) => void
  disabled?: boolean
}) {
  const bouton = "grid size-11 place-items-center rounded-pill border border-line-strong bg-surface text-accent-ink hover:bg-accent-soft disabled:opacity-40"
  return (
    <table className="w-full border-collapse text-[14px]">
      <caption className="sr-only">{libelle} : quantité par coupure</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Coupure</th>
          <th scope="col">Quantité</th>
          <th scope="col">Montant</th>
        </tr>
      </thead>
      <tbody>
        {coupures.map((coupure) => {
          const quantite = billetage[coupure] ?? 0
          return (
            <tr key={coupure} className="border-t border-line first:border-t-0">
              <th scope="row" className="tabular py-1.5 text-left text-[14px] font-semibold">
                {montant(coupure)}
              </th>
              <td className="py-1.5">
                <span className="inline-flex items-center gap-1">
                  <button type="button" className={bouton} disabled={disabled || quantite === 0} aria-label={`Retirer une coupure de ${montant(coupure)}`} onClick={() => onChange({ ...billetage, [coupure]: quantite - 1 })}>
                    <Minus aria-hidden className="size-4" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Quantité de coupures de ${montant(coupure)}`}
                    className="tabular h-11 w-14 rounded-md border border-line-strong bg-surface text-center text-[15px] font-semibold"
                    value={quantite}
                    disabled={disabled}
                    onChange={(event) => onChange({ ...billetage, [coupure]: Math.min(9999, Number(event.target.value.replace(/\D/g, "") || 0)) })}
                  />
                  <button type="button" className={bouton} disabled={disabled} aria-label={`Ajouter une coupure de ${montant(coupure)}`} onClick={() => onChange({ ...billetage, [coupure]: quantite + 1 })}>
                    <Plus aria-hidden className="size-4" />
                  </button>
                </span>
              </td>
              <td className="tabular py-1.5 text-right text-[14px] font-semibold">{montant(coupure * quantite)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Total({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line pt-3 text-[18px] font-bold">
      <span>{libelle}</span>
      <span className="tabular">{xaf(valeur)}</span>
    </div>
  )
}

/* ════════════════════════════ Ouverture ═══════════════════════════════════ */

function Ouverture({ contexte, enLigne }: { contexte: Contexte; enLigne: boolean }) {
  const ouvrir = useEcriture(api.functions.cash.openSession)
  const [billetage, setBilletage] = useState<Billetage>({})
  const [carnet, setCarnet] = useState({ number: "", firstNumber: "", lastNumber: "" })
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const fonds = totalBilletage(billetage)
  const carnetSaisi = carnet.number.trim() || carnet.firstNumber.trim() || carnet.lastNumber.trim()
  const carnetComplet = carnet.number.trim() && carnet.firstNumber.trim() && carnet.lastNumber.trim()

  const valider = async () => {
    if (carnetSaisi && !carnetComplet) return setErreur("Carnet de secours incomplet : numéro, première et dernière souche.")
    setEnCours(true)
    setErreur("")
    try {
      await ouvrir({
        openingFloatXaf: fonds,
        openingBreakdown: lignesBilletage(billetage),
        emergencyBooklet: carnetComplet ? carnet : undefined,
      })
    } catch (cause) {
      setErreur(messageErreur(cause, "La caisse n'a pas pu être ouverte."))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <EnTetePage
        surtitre={`${contexte.pointOfSale.name} · ${dateCourte(jourDeService(), true)}`}
        titre="Ouvrir la caisse"
        description="Rien ne se vend tant que la caisse n'est pas ouverte : le fonds compté ici est le point de départ du rapprochement du soir."
      />
      {!enLigne ? <HorsReseau /> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panneau titre="Fonds de caisse" icone={Banknote} sousTitre="Compté coupure par coupure">
          <TableBilletage billetage={billetage} onChange={setBilletage} />
          <Total libelle="Fonds d'ouverture" valeur={fonds} />
        </Panneau>
        {/* Colonne d'action : elle suit le défilement, le bouton reste en vue. */}
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Panneau titre="Carnet de secours" icone={FileText}>
            <p className="text-small text-ink-muted">Billets pré-imprimés remis avec la caisse, pour vendre si le réseau tombe. Facultatif.</p>
            <Field label="N° du carnet" htmlFor="carnet-numero">
              <Input id="carnet-numero" className="tabular" value={carnet.number} onChange={(e) => setCarnet({ ...carnet, number: e.target.value })} placeholder="0042" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Première souche" htmlFor="carnet-premiere">
                <Input id="carnet-premiere" className="tabular" value={carnet.firstNumber} onChange={(e) => setCarnet({ ...carnet, firstNumber: e.target.value })} placeholder="004201" />
              </Field>
              <Field label="Dernière souche" htmlFor="carnet-derniere">
                <Input id="carnet-derniere" className="tabular" value={carnet.lastNumber} onChange={(e) => setCarnet({ ...carnet, lastNumber: e.target.value })} placeholder="004250" />
              </Field>
            </div>
          </Panneau>
          {erreur ? (
            <InlineMessage tone="danger" title="Ouverture refusée.">
              {erreur}
            </InlineMessage>
          ) : null}
          <Button type="button" size="lg" block disabled={!enLigne} loading={enCours} loadingLabel="Ouverture…" onClick={valider}>
            <LockOpen aria-hidden />
            Ouvrir la caisse · {xaf(fonds)}
          </Button>
        </div>
      </div>
    </>
  )
}

/* ═════════════════════════════ Clôture ════════════════════════════════════ */

function Ecart({ ecart }: { ecart: number }) {
  if (ecart === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md bg-success-soft px-4 py-3.5 text-success-ink" role="status">
        <CircleCheck aria-hidden className="size-[22px] shrink-0" />
        <span className="grid">
          <b className="text-[16px] font-bold">Caisse juste</b>
          <span className="text-[14px]">Compté = attendu</span>
        </span>
        <span className="tabular ml-auto text-[22px] font-bold">0</span>
      </div>
    )
  }
  const manque = ecart < 0
  const Icone = manque ? CircleAlert : TriangleAlert
  return (
    <div className={cn("flex items-center gap-3 rounded-md px-4 py-3.5", manque ? "bg-danger-soft text-danger-ink" : "bg-warning-soft text-warning-ink")} role="status">
      <Icone aria-hidden className="size-[22px] shrink-0" />
      <span className="grid">
        <b className="text-[16px] font-bold">{manque ? "Manque en caisse" : "Excédent en caisse"}</b>
        <span className="text-[14px]">À justifier avant la clôture</span>
      </span>
      <span className="tabular ml-auto text-[22px] font-bold">{montantSigne(ecart)}</span>
    </div>
  )
}

function Cloture({ detail, contexte, enLigne, onCloturee }: { detail: DetailCaisse; contexte: Contexte; enLigne: boolean; onCloturee: (sessionId: string) => void }) {
  const cloturer = useEcriture(api.functions.cash.closeSession)
  const { imprimer, zone } = useImpression()
  const [billetage, setBilletage] = useState<Billetage>({})
  const [constates, setConstates] = useState<Record<string, string>>({})
  const [justification, setJustification] = useState("")
  const [tentative, setTentative] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  const attenduEspeces = detail.attendu.find((a) => a.method === "especes")?.amountXaf ?? 0
  const autres = detail.attendu.filter((a) => a.method !== "especes")
  const especesAttendues = detail.fonds + attenduEspeces
  const compteEspeces = totalBilletage(billetage)
  const constate = (moyen: string, attendu: number) => (constates[moyen] === undefined ? attendu : Number(constates[moyen] || 0))
  const ecart =
    compteEspeces - especesAttendues + autres.reduce((s, a) => s + (constate(a.method, a.amountXaf) - a.amountXaf), 0)
  const justifManquante = ecart !== 0 && !justification.trim()

  const valider = async () => {
    setTentative(true)
    if (justifManquante) return
    setEnCours(true)
    setErreur("")
    try {
      const r = await cloturer({
        countedByMethod: [
          { method: "especes", amountXaf: compteEspeces - detail.fonds },
          ...autres.map((a) => ({ method: a.method, amountXaf: constate(a.method, a.amountXaf) })),
        ],
        closingBreakdown: lignesBilletage(billetage),
        varianceReason: justification.trim() || undefined,
      })
      onCloturee(r.sessionId)
    } catch (cause) {
      setErreur(messageErreur(cause, "La caisse n'a pas pu être clôturée."))
    } finally {
      setEnCours(false)
    }
  }

  const lignes: Array<{ moyen: MoyenPaiement; operations: number; attendu: number; constate: ReactNode; source: ReactNode }> = [
    {
      moyen: "especes",
      operations: detail.attendu.find((a) => a.method === "especes")?.count ?? 0,
      attendu: especesAttendues,
      constate: <span className="tabular">{montant(compteEspeces)}</span>,
      source: "Comptage du billetage (fonds compris)",
    },
    ...autres.map((a) => ({
      moyen: a.method,
      operations: a.count,
      attendu: a.amountXaf,
      constate: (
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Constaté ${libelleMoyen(a.method)}`}
          className="tabular h-11 w-28 rounded-md border border-line-strong bg-surface px-2 text-right text-[14px]"
          value={constates[a.method] ?? String(a.amountXaf)}
          onChange={(event) => setConstates({ ...constates, [a.method]: event.target.value.replace(/[^\d-]/g, "") })}
        />
      ),
      source: <Tag tone="neutral">{sourceRapprochement(a.method)}</Tag>,
    })),
  ]

  return (
    <>
      <EnTetePage
        surtitre={`${contexte.pointOfSale.name} · journée du ${dateCourte(detail.journee ?? jourDeService(), true)}`}
        titre="Clôturer la caisse"
        description="Le système connaît ce qui doit être en caisse ; vous comptez ce qui y est. Tout écart se justifie par écrit avant la clôture."
        actions={
          <Button type="button" variant="secondary" onClick={() => imprimer(<EtatCaisse detail={detail} />, "a4")}>
            <Printer aria-hidden />
            Imprimer l&apos;état de caisse
          </Button>
        }
      />
      {!enLigne ? <HorsReseau /> : null}
      <Indicateurs>
        <Indicateur libelle="Fonds d'ouverture" icone={LockOpen} valeur={montant(detail.fonds)} unite="XAF" evolution={{ sens: "neutre", texte: `ouverte à ${heure(detail.ouverteA)}` }} />
        <Indicateur
          libelle="Encaissements"
          icone={ArrowDownToLine}
          valeur={montant(detail.encaissements.montant)}
          unite="XAF"
          evolution={{ sens: "neutre", texte: `${detail.encaissements.nombre} opération${detail.encaissements.nombre > 1 ? "s" : ""}` }}
        />
        <Indicateur
          libelle="Annulations et remboursements"
          icone={RotateCcw}
          valeur={montantSigne(detail.sorties.montant)}
          unite="XAF"
          evolution={{ sens: "neutre", texte: detail.sorties.nombre ? `${detail.sorties.nombre} écriture${detail.sorties.nombre > 1 ? "s" : ""}` : "aucune" }}
        />
        <Indicateur fort libelle="Espèces attendues" icone={Banknote} valeur={montant(especesAttendues)} unite="XAF" evolution={{ sens: "neutre", texte: "fonds compris" }} />
      </Indicateurs>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4">
          <Panneau titre="Billetage" icone={Banknote} sousTitre="Espèces comptées, fonds compris">
            <TableBilletage billetage={billetage} onChange={setBilletage} />
            <Total libelle="Total compté" valeur={compteEspeces} />
          </Panneau>
          <Panneau titre="Par moyen de paiement" icone={Wallet} plein>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[14px]">
                <thead>
                  <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                    <th scope="col" className="px-3.5 py-2.5">Moyen</th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">Opérations</th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">Attendu</th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">Constaté</th>
                    <th scope="col" className="px-3.5 py-2.5">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.moyen} className="border-t border-line">
                      <th scope="row" className="px-3.5 py-2.5 text-left font-semibold">{libelleMoyen(l.moyen)}</th>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">{l.operations}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">{montant(l.attendu)}</td>
                      <td className="px-3.5 py-2.5 text-right">{l.constate}</td>
                      <td className="px-3.5 py-2.5 text-[13px] text-ink-muted">{l.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panneau>
        </div>
        {/* Colonne d'action : elle suit le défilement, la clôture reste en vue. */}
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Panneau titre="Rapprochement" icone={Scale}>
            <Fiche
              elements={[
                ["Espèces attendues", <span key="a" className="tabular">{xaf(especesAttendues)}</span>],
                ["Espèces comptées", <span key="c" className="tabular">{xaf(compteEspeces)}</span>],
                autres.length > 0 && ["Autres moyens", <span key="m" className="tabular">{montantSigne(ecart - (compteEspeces - especesAttendues))} XAF</span>],
              ]}
            />
            <Ecart ecart={ecart} />
            {ecart !== 0 ? (
              <Field
                label="Justification de l'écart"
                htmlFor="justification-ecart"
                error={tentative && justifManquante ? `Justifiez l'écart de ${montantSigne(ecart)} XAF, ou recomptez le billetage.` : undefined}
                hint="Ex. : pièce de 500 XAF rendue en trop à 11:58 (vente n° …)."
              >
                <Textarea id="justification-ecart" rows={3} value={justification} onChange={(event) => setJustification(event.target.value)} />
              </Field>
            ) : null}
          </Panneau>
          {erreur ? (
            <InlineMessage tone="danger" title="Clôture refusée.">
              {erreur}
            </InlineMessage>
          ) : null}
          <Button type="button" size="lg" block disabled={!enLigne} loading={enCours} loadingLabel="Clôture…" onClick={valider}>
            <Lock aria-hidden />
            Clôturer la caisse
          </Button>
        </div>
      </div>
      {zone}
    </>
  )
}

/* ═══════════════════════════ État de caisse ═══════════════════════════════ */

/** État de caisse imprimable (A4), signé du vendeur et du chef de gare. */
export function EtatCaisse({ detail }: { detail: DetailCaisse }) {
  const especesCompte = detail.billetageCloture ? detail.billetageCloture.reduce((s, l) => s + l.denomination * l.count, 0) : null
  return (
    <article className="grid gap-5 bg-surface p-2 text-[12.5px] text-ink">
      <header className="grid gap-1 border-b border-line-strong pb-3">
        <b className="text-[18px]">SETRAG · État de caisse</b>
        <span>
          {detail.pointDeVente?.name ?? "—"} · journée du {detail.journee ?? "—"} · {detail.vendeur ?? "—"}
          {detail.matricule ? ` (${detail.matricule})` : ""}
        </span>
        <span className="tabular">
          Ouverte le {dateHeure(detail.ouverteA)}
          {detail.clotureeA ? ` · clôturée le ${dateHeure(detail.clotureeA)}` : " · en cours"}
        </span>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <th className="border-b border-line py-1">Moyen</th>
            <th className="border-b border-line py-1 text-right">Opérations</th>
            <th className="border-b border-line py-1 text-right">Attendu (hors fonds)</th>
            <th className="border-b border-line py-1 text-right">Constaté (hors fonds)</th>
          </tr>
        </thead>
        <tbody>
          {detail.attendu.map((a) => (
            <tr key={a.method}>
              <td className="py-1">{libelleMoyen(a.method)}</td>
              <td className="tabular py-1 text-right">{a.count}</td>
              <td className="tabular py-1 text-right">{montant(a.amountXaf)}</td>
              <td className="tabular py-1 text-right">
                {detail.compte ? montant(detail.compte.find((c) => c.method === a.method)?.amountXaf ?? 0) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-1">
        <span>
          Fonds d&apos;ouverture : <span className="tabular">{xaf(detail.fonds)}</span>
        </span>
        {especesCompte !== null ? (
          <span>
            Espèces comptées (fonds compris) : <span className="tabular">{xaf(especesCompte)}</span>
          </span>
        ) : null}
        <span>
          Écart : <b className="tabular">{detail.ecart === null ? "—" : `${montantSigne(detail.ecart)} XAF`}</b>
          {detail.justification ? ` · ${detail.justification}` : ""}
        </span>
      </div>
      {detail.billetageCloture ? (
        <div>
          <b>Billetage de clôture</b>
          <div className="tabular">
            {detail.billetageCloture.map((l) => `${montant(l.denomination)} × ${l.count}`).join(" · ")}
          </div>
        </div>
      ) : null}
      <div>
        <b>Opérations ({detail.operations.length})</b>
        <table className="w-full border-collapse">
          <tbody>
            {detail.operations.map((o) => (
              <tr key={o.id}>
                <td className="tabular py-0.5">{heure(o.heure)}</td>
                <td className="tabular py-0.5">{o.numero}</td>
                <td className="py-0.5">{libelleProduit(o.produit, o.kind)}</td>
                <td className="py-0.5">{libelleMoyen(o.moyen)}</td>
                <td className="tabular py-0.5 text-right">{montantSigne(o.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="grid grid-cols-2 gap-8 pt-8">
        <span className="border-t border-line-strong pt-2">Signature du vendeur</span>
        <span className="border-t border-line-strong pt-2">Visa du chef de gare</span>
      </footer>
    </article>
  )
}

/* ═════════════════════════════ Historique ═════════════════════════════════ */

const COLONNES_SESSIONS: readonly ColonneTableau<SessionPassee>[] = [
  { cle: "journee", libelle: "Journée", rendu: (s) => (s.journee ? dateCourte(s.journee, true) : "—"), tri: (s) => s.journee ?? "" },
  { cle: "ouverture", libelle: "Ouverture", rendu: (s) => <span className="tabular">{heure(s.ouverteA)}</span>, tri: (s) => s.ouverteA, export: (s) => new Date(s.ouverteA) },
  {
    cle: "cloture",
    libelle: "Clôture",
    rendu: (s) => <span className="tabular">{s.clotureeA ? heure(s.clotureeA) : "—"}</span>,
    tri: (s) => s.clotureeA ?? 0,
    export: (s) => (s.clotureeA ? new Date(s.clotureeA) : ""),
  },
  { cle: "operations", libelle: "Opérations", rendu: (s) => s.operations, tri: (s) => s.operations, numerique: true },
  { cle: "attendu", libelle: "Attendu", rendu: (s) => montant(s.attendu), tri: (s) => s.attendu, numerique: true, secondaire: true },
  { cle: "compte", libelle: "Compté", rendu: (s) => (s.compte === null ? "—" : montant(s.compte)), tri: (s) => s.compte ?? 0, numerique: true, secondaire: true },
  { cle: "ecart", libelle: "Écart", rendu: (s) => (s.ecart === null ? "—" : montantSigne(s.ecart)), tri: (s) => s.ecart ?? 0, numerique: true },
  {
    cle: "statut",
    libelle: "État",
    rendu: (s) =>
      s.statut === "ouverte" ? (
        <Tag tone="success">
          <LockOpen aria-hidden />
          Ouverte
        </Tag>
      ) : s.statut === "validee" ? (
        <Tag tone="info">
          <CircleCheck aria-hidden />
          Visée
        </Tag>
      ) : (
        <Tag tone="neutral">
          <Lock aria-hidden />
          Clôturée
        </Tag>
      ),
    tri: (s) => s.statut,
  },
]

function DetailSession({ sessionId, onFermer }: { sessionId: string; onFermer: () => void }) {
  const detail = useLecture(api.functions.guichet.sessionCaisse, { sessionId: sessionId as never })
  const { imprimer, zone } = useImpression()
  return (
    <Dialog open onOpenChange={(o) => (!o ? onFermer() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto grid h-dvh w-[min(560px,100vw)] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none bg-surface p-0 text-ink sm:max-w-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <DialogTitle className="text-[18px] font-bold">{detail?.journee ? `Caisse du ${dateCourte(detail.journee, true)}` : "Session de caisse"}</DialogTitle>
            <DialogDescription className="text-small text-ink-muted">{detail ? `${detail.vendeur ?? "—"} · ${detail.pointDeVente?.name ?? ""}` : "Chargement…"}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer" onClick={onFermer}>
            <X />
          </Button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {detail === undefined ? (
            <SkeletonLines />
          ) : detail === null ? (
            <InlineMessage tone="warning" title="Session introuvable." />
          ) : (
            <div className="grid gap-4">
              <Fiche
                elements={[
                  ["Ouverture", dateHeure(detail.ouverteA)],
                  ["Clôture", detail.clotureeA ? dateHeure(detail.clotureeA) : "En cours"],
                  ["Fonds", xaf(detail.fonds)],
                  ["Encaissements", `${xaf(detail.encaissements.montant)} · ${detail.encaissements.nombre} op.`],
                  ["Sorties", `${montantSigne(detail.sorties.montant)} XAF · ${detail.sorties.nombre}`],
                  ["Écart", detail.ecart === null ? "—" : `${montantSigne(detail.ecart)} XAF`],
                  detail.justification ? ["Justification", detail.justification] : null,
                  detail.carnet ? ["Carnet de secours", `${detail.carnet.number} · ${detail.carnet.firstNumber} → ${detail.carnet.lastNumber}`] : null,
                ]}
              />
              <EtatCaisse detail={detail} />
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line bg-surface-sunk px-5 py-4">
          <Button type="button" variant="secondary" disabled={!detail} onClick={() => detail && imprimer(<EtatCaisse detail={detail} />, "a4")}>
            <Printer aria-hidden />
            Imprimer l&apos;état de caisse
          </Button>
        </footer>
        {zone}
      </DialogContent>
    </Dialog>
  )
}

function Historique({ sessions }: { sessions: SessionPassee[] | undefined }) {
  const [ouverte, setOuverte] = useState<string | null>(null)
  return (
    <section className="grid gap-3" aria-label="Historique des caisses">
      <TableauDonnees
        libelle="Sessions de caisse"
        colonnes={COLONNES_SESSIONS}
        lignes={sessions}
        cle={(s) => s.id}
        surLigne={(s) => setOuverte(s.id)}
        selection={ouverte ?? undefined}
        exportNom="sessions-caisse"
        triInitial={{ cle: "ouverture", sens: "desc" }}
        parPage={15}
        vide={{ titre: "Aucune caisse passée", description: "Les sessions clôturées s'afficheront ici avec leur écart." }}
      />
      {ouverte ? <DetailSession sessionId={ouverte} onFermer={() => setOuverte(null)} /> : null}
    </section>
  )
}

/* ═════════════════════════════ Écran ══════════════════════════════════════ */

function Cloturee({ sessionId, onNouvelle }: { sessionId: string; onNouvelle: () => void }) {
  const detail = useLecture(api.functions.guichet.sessionCaisse, { sessionId: sessionId as never })
  const { imprimer, zone } = useImpression()
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-md bg-success-soft px-5 py-4 text-success-ink" role="status">
        <CircleCheck aria-hidden className="size-8 shrink-0" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="text-[22px] font-bold text-ink">Caisse clôturée</h1>
          <p className="text-[14px]">
            {detail && detail.ecart !== null
              ? detail.ecart === 0
                ? "Caisse juste. L'état de caisse part au chef de gare pour visa."
                : `Écart de ${montantSigne(detail.ecart)} XAF justifié. L'état de caisse part au chef de gare pour visa.`
              : "L'état de caisse part au chef de gare pour visa."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!detail} onClick={() => detail && imprimer(<EtatCaisse detail={detail} />, "a4")}>
            <Printer aria-hidden />
            Imprimer l&apos;état de caisse
          </Button>
          <Button type="button" variant="ghost" onClick={onNouvelle}>
            <LockOpen aria-hidden />
            Ouvrir une nouvelle caisse
          </Button>
        </div>
      </div>
      {zone}
    </>
  )
}

type Vue = "jour" | "historique"

function EcranCaisse({ contexte, enLigne }: { contexte: Contexte; enLigne: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  // L'onglet vit dans l'adresse : l'historique se partage et survit au rechargement.
  const vue: Vue = params.get("vue") === "historique" ? "historique" : "jour"
  const detail = useLecture(api.functions.guichet.caisse, {})
  const sessions = useLecture(api.functions.guichet.sessionsCaisse, { limite: 60 })
  const [cloturee, setCloturee] = useState<string | null>(null)
  const contenu = useMemo(() => {
    if (cloturee) return <Cloturee sessionId={cloturee} onNouvelle={() => setCloturee(null)} />
    if (detail === undefined) return <ChargementEcran libelle="Chargement de la caisse…" />
    if (detail === null) return <Ouverture contexte={contexte} enLigne={enLigne} />
    return <Cloture detail={detail} contexte={contexte} enLigne={enLigne} onCloturee={setCloturee} />
  }, [cloturee, detail, contexte, enLigne])
  return (
    <>
      <Onglets<Vue>
        libelle="Caisse"
        valeur={vue}
        onChange={(suivante) => router.replace((suivante === "historique" ? "/vente/caisse?vue=historique" : "/vente/caisse") as Route, { scroll: false })}
        onglets={[
          { cle: "jour", libelle: detail ? "Caisse du jour" : "Ouverture" },
          { cle: "historique", libelle: "Historique", compte: sessions?.length },
        ]}
      />
      <div role="tabpanel" aria-label={vue === "historique" ? "Historique des caisses" : "Caisse du jour"} className="grid gap-5">
        {vue === "historique" ? (
          <>
            <EnTetePage
              surtitre={contexte.pointOfSale.name}
              titre="Historique des caisses"
              description="Vos sessions des deux derniers mois, avec leur écart et leur visa. Ouvrez une ligne pour revoir et réimprimer l'état de caisse."
            />
            <Historique sessions={sessions} />
          </>
        ) : (
          contenu
        )}
      </div>
    </>
  )
}

export function CashPageClient() {
  const { contexte, enLigne } = useGuichet()
  return (
    <CadreGuichet contexte={contexte}>
      {contexte ? (
        <LimiteErreur titre="La caisse n'a pas pu être lue.">
          <Suspense fallback={<ChargementEcran libelle="Chargement de la caisse…" />}>
            <EcranCaisse contexte={contexte} enLigne={enLigne} />
          </Suspense>
        </LimiteErreur>
      ) : (
        <ChargementEcran libelle="Chargement de la caisse…" />
      )}
    </CadreGuichet>
  )
}
