"use client"

import { ArrowLeft, Printer } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useRef } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/marque"

import { dateHeure, dateService } from "@/components/gestion/referentiels/format"

import { APTITUDES, FAMILLES, GRAVITES_DEFAUT, gmaoApi, PRIORITES, RESULTATS_CONTROLE, STATUTS_ENGIN, STATUTS_OT } from "../commun"
import { libelleDecision } from "./decision"

/**
 * Bulletin de visite à imprimer (ou enregistrer en PDF) : une page sans
 * coquille, lisible en noir et blanc — chaque état est écrit.
 */
export function BulletinImprimable({ visiteId }: { visiteId: string }) {
  const dossier = useQuery(gmaoApi.queries.visite, { visiteId: visiteId as never })
  const imprime = useRef(false)

  useEffect(() => {
    if (!dossier || imprime.current) return
    imprime.current = true
    const minuterie = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(minuterie)
  }, [dossier])

  const retour = (
    <Button asChild variant="ghost" className="print:hidden">
      <Link href={`/materiel/visites/${visiteId}` as Route}>
        <ArrowLeft />
        Retour au bulletin
      </Link>
    </Button>
  )

  if (dossier === undefined) {
    return (
      <main className="mx-auto grid max-w-[1000px] gap-4 bg-surface p-6 text-ink">
        <p role="status" className="text-small text-ink-muted">
          Préparation du bulletin…
        </p>
      </main>
    )
  }
  if (dossier === null) {
    return (
      <main className="mx-auto grid max-w-[1000px] gap-4 bg-surface p-6 text-ink">
        <h1 className="text-[20px] font-bold">Visite introuvable</h1>
        <p className="text-small text-ink-muted">Le lien est peut-être ancien, ou la visite a été purgée.</p>
        <Button asChild variant="secondary" className="w-fit">
          <Link href="/materiel/visites">Revenir aux visites</Link>
        </Button>
      </main>
    )
  }

  const { visite, decision } = dossier
  const cellule = "border border-line-strong px-2 py-1 text-left align-top"

  return (
    <main className="mx-auto grid max-w-[1000px] gap-4 bg-surface p-6 text-[12.5px] text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">Bulletin de visite technique avant départ</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular">{visite.numero}</span> · convoi <span className="tabular">{visite.convoi}</span> · {dossier.atelier?.nom ?? "—"}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Ouverte le <span className="tabular">{dateHeure(visite.debutLe)}</span>
          </p>
          <p>
            Imprimé depuis la GMAO · DMAT
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {retour}
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimer
          </Button>
        </div>
      </header>

      <section aria-label="Décision de départ" className="grid gap-1 rounded-md border-2 border-ink p-3">
        <p className="text-[18px] font-bold uppercase">{libelleDecision(decision)}</p>
        {decision.motifs.length > 0 ? (
          <ul className="list-disc pl-5">
            {decision.motifs.map((motif) => (
              <li key={motif}>{motif}</li>
            ))}
          </ul>
        ) : (
          <p>Visite signée, aucun engin du convoi indisponible.</p>
        )}
        <p>
          Aptitude prononcée : <b>{visite.aptitude ? APTITUDES[visite.aptitude].libelle : "non prononcée (visite non signée)"}</b>
        </p>
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Circulation</h2>
        <p>
          {dossier.trajet
            ? `Train ${dossier.trajet.train} · ${dateService(dossier.trajet.serviceDate)} · départ prévu ${dateHeure(dossier.trajet.departureAt)}`
            : "Convoi hors plan de transport"}
        </p>
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Composition du convoi ({dossier.engins.length} engin(s))</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={cellule}>Engin</th>
              <th scope="col" className={cellule}>Famille</th>
              <th scope="col" className={cellule}>Série</th>
              <th scope="col" className={cellule}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {dossier.engins.map((engin) => (
              <tr key={engin.id} className="break-inside-avoid">
                <td className={`${cellule} tabular font-semibold`}>{engin.numero}</td>
                <td className={cellule}>{FAMILLES[engin.famille]}</td>
                <td className={cellule}>{engin.serie}</td>
                <td className={cellule}>{STATUTS_ENGIN[engin.statut].libelle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Check-list</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={cellule}>Contrôle</th>
              <th scope="col" className={cellule}>Résultat</th>
            </tr>
          </thead>
          <tbody>
            {visite.controles.map((controle) => (
              <tr key={controle.code} className="break-inside-avoid">
                <td className={cellule}>{controle.libelle}</td>
                <td className={`${cellule} font-semibold`}>{RESULTATS_CONTROLE[controle.resultat]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Défauts relevés ({visite.defauts.length})</h2>
        {visite.defauts.length === 0 ? (
          <p>Aucun défaut relevé.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={cellule}>Engin</th>
                <th scope="col" className={cellule}>Organe</th>
                <th scope="col" className={cellule}>Description</th>
                <th scope="col" className={cellule}>Gravité</th>
              </tr>
            </thead>
            <tbody>
              {visite.defauts.map((defaut) => (
                <tr key={defaut.index} className="break-inside-avoid">
                  <td className={`${cellule} tabular`}>{defaut.numeroEngin}</td>
                  <td className={cellule}>{defaut.organe}</td>
                  <td className={cellule}>{defaut.description}</td>
                  <td className={`${cellule} font-semibold`}>{GRAVITES_DEFAUT[defaut.gravite]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {dossier.ordres.length > 0 ? (
        <section className="grid gap-1">
          <h2 className="text-[14px] font-bold">Ordres de travail ouverts</h2>
          <ul className="list-disc pl-5">
            {dossier.ordres.map((ot) => (
              <li key={ot.id}>
                <span className="tabular font-semibold">{ot.numero}</span> — {ot.titre} · priorité {PRIORITES[ot.priorite].libelle.toLowerCase()} ·{" "}
                {STATUTS_OT[ot.statut].libelle.toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-1">
        <h2 className="text-[14px] font-bold">Observations</h2>
        <p className="whitespace-pre-line">{visite.observations ?? "Aucune observation."}</p>
      </section>

      <footer className="grid grid-cols-2 gap-6 border-t border-line-strong pt-3">
        <div className="grid gap-1">
          <span className="font-semibold">Visiteur de rames</span>
          <span>{visite.visiteur ?? "—"}</span>
          <span>
            {visite.signeeLe ? (
              <>
                Signé le <span className="tabular">{dateHeure(visite.signeeLe)}</span>
              </>
            ) : (
              "Visite non signée"
            )}
          </span>
        </div>
        <div className="grid gap-1">
          <span className="font-semibold">Visa du chef de circulation</span>
          <span className="h-12 border-b border-line-strong" aria-hidden />
        </div>
      </footer>
    </main>
  )
}
