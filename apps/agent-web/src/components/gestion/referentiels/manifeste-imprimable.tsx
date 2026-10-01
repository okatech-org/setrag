"use client"

import { Printer } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { usePortalSession } from "@/components/portal-guard"

import { dateHeure, dateService, libelleDesserte, messageErreur, nombre } from "./format"
import { categorie, controleTexte, placeDe, type Extraction } from "./voyageurs"

/**
 * Manifeste à imprimer (ou enregistrer en PDF) : une page sans coquille, le
 * tableau seul. L'extraction et l'impression sont toutes deux journalisées.
 */
export function ManifesteImprimable() {
  const parametres = useSearchParams()
  const session = usePortalSession()
  const extraire = useMutation(api.functions.referentiels.extraireManifeste)
  const journaliser = useMutation(api.functions.referentiels.journaliserExportManifeste)
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const lance = useRef(false)
  const date = parametres.get("date") ?? ""
  const tripId = parametres.get("desserte") ?? undefined
  const stationId = parametres.get("gare") ?? undefined
  const recherche = parametres.get("q") ?? undefined

  useEffect(() => {
    if (lance.current) return
    lance.current = true
    void (async () => {
      try {
        const resultat = await extraire({
          tripId: tripId as never,
          serviceDate: tripId ? undefined : date,
          stationId: stationId as never,
          recherche,
        })
        setExtraction(resultat)
        await journaliser({ tripId: tripId as never, serviceDate: date, format: "impression", voyageurs: resultat.lignes.length })
        window.setTimeout(() => window.print(), 400)
      } catch (cause) {
        setErreur(messageErreur(cause, "Extraction impossible."))
      }
    })()
  }, [date, extraire, journaliser, recherche, stationId, tripId])

  const user = session?.profile.user
  const desserte = extraction?.dessertes.length === 1 ? extraction.dessertes[0] : null

  return (
    <main className="mx-auto grid max-w-[1100px] gap-4 bg-surface p-6 text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">Manifeste voyageurs</h1>
          <p className="text-[13px] text-ink-muted">
            {desserte ? `${libelleDesserte(desserte)} · ${dateService(desserte.serviceDate)}` : `Dessertes du ${dateService(date)}`}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Extrait le <span className="tabular">{dateHeure(extraction?.generatedAt)}</span>
          </p>
          <p>
            par {user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "—"} {user?.matricule ? `· ${user.matricule}` : ""}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()} disabled={!extraction}>
          <Printer />
          Imprimer
        </Button>
      </header>
      {erreur ? <InlineMessage tone="danger" title="Manifeste indisponible">{erreur}</InlineMessage> : null}
      {!extraction && !erreur ? <p role="status" className="text-small text-ink-muted">Extraction en cours…</p> : null}
      {extraction ? (
        <>
          <p className="text-[13px]">
            <b>{nombre(extraction.lignes.length)}</b> voyageur(s) · <b>{nombre(extraction.lignes.filter((p) => p.controle).length)}</b> contrôlé(s)
            {extraction.tronque ? " · liste tronquée à 1 500" : ""}
          </p>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">Voyageur</th>
                <th scope="col" className="py-1 pr-2">Billet</th>
                <th scope="col" className="py-1 pr-2">Trajet</th>
                <th scope="col" className="py-1 pr-2">Place</th>
                <th scope="col" className="py-1 pr-2">Téléphone</th>
                <th scope="col" className="py-1 pr-2">Nationalité</th>
                <th scope="col" className="py-1">Contrôle</th>
              </tr>
            </thead>
            <tbody>
              {extraction.lignes.map((p) => (
                <tr key={p.ticketId} className="break-inside-avoid border-b border-line">
                  <td className="py-1 pr-2">
                    <b>
                      {p.nom} {p.prenom}
                    </b>
                    <span className="block text-ink-muted">{categorie(p)}</span>
                  </td>
                  <td className="tabular py-1 pr-2">{p.number}</td>
                  <td className="py-1 pr-2">
                    {p.origine} → {p.destination}
                  </td>
                  <td className="tabular py-1 pr-2">{placeDe(p)}</td>
                  <td className="tabular py-1 pr-2">{p.telephone ?? "—"}</td>
                  <td className="py-1 pr-2">{p.nationalite ?? "—"}</td>
                  <td className="py-1">{controleTexte(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="border-t border-line pt-2 text-[11px] text-ink-muted">
            Document confidentiel — données nominatives. Téléphones masqués. Cette impression est inscrite au journal d’audit.
          </footer>
        </>
      ) : null}
    </main>
  )
}
