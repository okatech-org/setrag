"use client"

import { ArrowLeft, Printer } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { usePortalSession } from "@/components/portal-guard"

import { FAMILLES, gmaoApi, heures, km, ORIGINES_OT, PRIORITES, quantite, STATUTS_OT, TYPES_OT, xaf, type DossierOt } from "../commun"
import { GardeDossier } from "./outils"

/**
 * Fiche d'OT à imprimer (ou enregistrer en PDF) : une page sans coquille,
 * toutes les informations du dossier et les zones de signature du
 * réparateur et de la réception.
 */
export function ImpressionOt({ otId }: { otId: string }) {
  return (
    <GardeDossier key={otId} secours={<Introuvable otId={otId} />}>
      <ImpressionOtChargee otId={otId} />
    </GardeDossier>
  )
}

function Introuvable({ otId }: { otId: string }) {
  return (
    <main className="mx-auto grid max-w-[900px] gap-4 p-6">
      <InlineMessage tone="danger" title="Ordre de travail introuvable">
        Le lien est peut-être ancien, ou l&apos;OT a été purgé avec le jeu de démonstration.
      </InlineMessage>
      <Button asChild variant="secondary" className="w-fit">
        <Link href={"/materiel/ordres" as Route}>
          <ArrowLeft />
          Ordres de travail
        </Link>
      </Button>
      <span className="sr-only">{otId}</span>
    </main>
  )
}

function ImpressionOtChargee({ otId }: { otId: string }) {
  const dossier = useQuery(gmaoApi.queries.ordreTravail, { otId: otId as never })
  const session = usePortalSession()
  const imprime = useRef(false)
  const [imprimeLe] = useState(() => Date.now())

  useEffect(() => {
    if (!dossier || imprime.current) return
    imprime.current = true
    const minuterie = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(minuterie)
  }, [dossier])

  if (dossier === undefined) {
    return (
      <main className="mx-auto max-w-[900px] p-6">
        <p role="status" className="text-small text-ink-muted">
          Préparation de la fiche…
        </p>
      </main>
    )
  }
  if (dossier === null) return <Introuvable otId={otId} />

  const user = session?.profile.user
  const imprimePar = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() + (user.matricule ? ` · ${user.matricule}` : "") : "—"
  return <FicheImprimable dossier={dossier} imprimePar={imprimePar} imprimeLe={imprimeLe} />
}

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 border-b border-line py-1">
      <dt className="text-ink-muted">{libelle}</dt>
      <dd className="font-semibold">{children ?? "—"}</dd>
    </div>
  )
}

function Signature({ titre, nom, le }: { titre: string; nom: string | null; le: number | null }) {
  return (
    <div className="grid min-h-36 content-start gap-1 rounded-md border border-line-strong p-3 break-inside-avoid">
      <b className="text-[13px]">{titre}</b>
      <p className="text-[12px] text-ink-muted">
        Nom : {nom ?? "................................................"}
      </p>
      <p className="text-[12px] text-ink-muted">
        Date : <span className="tabular">{le ? dateHeure(le) : "....../....../........"}</span>
      </p>
      <p className="mt-auto text-[12px] text-ink-muted">Signature :</p>
    </div>
  )
}

export function FicheImprimable({ dossier, imprimePar, imprimeLe }: { dossier: DossierOt; imprimePar: string; imprimeLe: number }) {
  const { ot, engin, atelier, plan, visite, incident } = dossier
  return (
    <main className="mx-auto grid max-w-[900px] gap-4 bg-surface p-6 text-[12.5px] text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">
            Ordre de travail <span className="tabular">{ot.numero}</span>
          </h1>
          <p className="text-[13px] text-ink-muted">{ot.titre}</p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Imprimé le <span className="tabular">{dateHeure(imprimeLe)}</span>
          </p>
          <p>par {imprimePar}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="ghost">
            <Link href={`/materiel/ordres/${ot.id}` as Route}>
              <ArrowLeft />
              Retour à l&apos;OT
            </Link>
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Printer />
            Imprimer
          </Button>
        </div>
      </header>

      <p className="text-[13px]">
        Statut : <b>{STATUTS_OT[ot.statut].libelle}</b> · Priorité : <b>{PRIORITES[ot.priorite].libelle}</b>
        {ot.enRetard ? (
          <>
            {" "}
            · <b>En retard</b>
          </>
        ) : null}{" "}
        · {ot.immobilisant ? "Engin immobilisé pendant l'intervention" : "Intervention sans immobilisation"}
      </p>

      <section className="grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
        <dl>
          <Ligne libelle="Engin">{engin ? `${FAMILLES[engin.famille]} ${engin.numero} · ${engin.serie}` : "—"}</Ligne>
          <Ligne libelle="Compteur au démarrage">{ot.kmDebut !== null ? <span className="tabular">{km(ot.kmDebut)}</span> : "—"}</Ligne>
          <Ligne libelle="Nature">{TYPES_OT[ot.type]}</Ligne>
          <Ligne libelle="Origine">
            {ORIGINES_OT[ot.origine]}
            {plan ? ` · plan ${plan.code}` : ""}
            {visite ? ` · visite ${visite.numero}` : ""}
            {incident ? ` · incident ${incident.reference ?? ""}` : ""}
          </Ligne>
          <Ligne libelle="Organe">{ot.organe ?? "—"}</Ligne>
          <Ligne libelle="Atelier">{atelier?.nom ?? "—"}</Ligne>
          <Ligne libelle="Équipe">{ot.equipe ?? "—"}</Ligne>
        </dl>
        <dl>
          <Ligne libelle="Demandé le">
            <span className="tabular">{dateHeure(ot.demandeLe)}</span> · {ot.demandeur ?? "Système"}
          </Ligne>
          <Ligne libelle="Début prévu">
            <span className="tabular">{dateHeure(ot.debutPrevu)}</span>
          </Ligne>
          <Ligne libelle="Fin prévue">
            <span className="tabular">{dateHeure(ot.finPrevue)}</span>
          </Ligne>
          <Ligne libelle="Début réel">
            <span className="tabular">{dateHeure(ot.debutReel)}</span>
          </Ligne>
          <Ligne libelle="Fin des travaux">
            <span className="tabular">{dateHeure(ot.finReelle)}</span>
          </Ligne>
          <Ligne libelle="Clôture">
            <span className="tabular">{dateHeure(ot.clotureLe)}</span>
            {ot.cloturePar ? ` · ${ot.cloturePar}` : ""}
          </Ligne>
        </dl>
      </section>

      <section className="grid gap-1 break-inside-avoid">
        <h2 className="text-[14px] font-bold">Description</h2>
        <p className="whitespace-pre-line">{ot.description}</p>
        {plan ? (
          <ul className="mt-1 grid gap-0.5">
            {plan.operations.map((operation) => (
              <li key={operation}>☐ {operation}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-1 break-inside-avoid">
        <h2 className="text-[14px] font-bold">Compte rendu des travaux</h2>
        {ot.compteRendu ? <p className="whitespace-pre-line">{ot.compteRendu}</p> : <div aria-hidden className="h-20 rounded-md border border-dashed border-line-strong" />}
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Temps passés · {heures(ot.heuresPassees)}</h2>
        {dossier.temps.length === 0 ? (
          <p className="text-ink-muted">Aucun temps saisi.</p>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">Date</th>
                <th scope="col" className="py-1 pr-2">Intervenant</th>
                <th scope="col" className="py-1 pr-2 text-right">Heures</th>
                <th scope="col" className="py-1 pr-2 text-right">Montant</th>
                <th scope="col" className="py-1">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {dossier.temps.map((t) => (
                <tr key={t.id} className="break-inside-avoid border-b border-line">
                  <td className="tabular py-1 pr-2">{dateCourte(t.date)}</td>
                  <td className="py-1 pr-2">
                    {t.intervenant}
                    {t.matricule ? <span className="tabular"> · {t.matricule}</span> : null}
                  </td>
                  <td className="tabular py-1 pr-2 text-right">{heures(t.heures)}</td>
                  <td className="tabular py-1 pr-2 text-right">{xaf(t.montantFcfa)}</td>
                  <td className="py-1">{t.commentaire ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Pièces</h2>
        {dossier.pieces.length === 0 ? (
          <p className="text-ink-muted">Aucune pièce consommée.</p>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">Date</th>
                <th scope="col" className="py-1 pr-2">Mouvement</th>
                <th scope="col" className="py-1 pr-2">Article</th>
                <th scope="col" className="py-1 pr-2 text-right">Quantité</th>
                <th scope="col" className="py-1 text-right">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {dossier.pieces.map((p) => (
                <tr key={p.id} className="break-inside-avoid border-b border-line">
                  <td className="tabular py-1 pr-2">{dateHeure(p.le)}</td>
                  <td className="py-1 pr-2">{p.sens === "sortie" ? "Sortie" : "Retour"}</td>
                  <td className="py-1 pr-2">
                    <span className="tabular">{p.reference}</span> — {p.designation}
                  </td>
                  <td className="tabular py-1 pr-2 text-right">
                    {p.sens === "sortie" ? "−" : "+"}
                    {quantite(p.quantite, p.unite)}
                  </td>
                  <td className="tabular py-1 text-right">{xaf(p.valeurFcfa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-1 break-inside-avoid">
        <h2 className="text-[14px] font-bold">Coûts</h2>
        <table className="w-full max-w-[420px] border-collapse text-[12px]">
          <tbody>
            <tr className="border-b border-line">
              <th scope="row" className="py-1 text-left font-normal">Main-d&apos;œuvre</th>
              <td className="tabular py-1 text-right">{xaf(ot.coutMainOeuvreFcfa)}</td>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className="py-1 text-left font-normal">Pièces</th>
              <td className="tabular py-1 text-right">{xaf(ot.coutPiecesFcfa)}</td>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className="py-1 text-left font-normal">Prestations externes</th>
              <td className="tabular py-1 text-right">{xaf(ot.coutExterneFcfa)}</td>
            </tr>
            <tr>
              <th scope="row" className="py-1 text-left">Total</th>
              <td className="tabular py-1 text-right font-bold">{xaf(ot.coutTotalFcfa)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        <Signature titre="Réparateur · fin des travaux" nom={ot.terminePar} le={ot.finReelle} />
        <Signature titre="Réception · remise en service" nom={ot.cloturePar} le={ot.clotureLe} />
      </section>

      <footer className="border-t border-line pt-2 text-[11px] text-ink-muted">
        Séparation des tâches : la remise en service est prononcée par un autre agent que celui qui a déclaré la fin des travaux.
      </footer>
    </main>
  )
}
