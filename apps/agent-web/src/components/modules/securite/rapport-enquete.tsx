"use client"

import { ArrowLeft, Printer } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { messageErreur } from "@/components/gestion/referentiels/format"
import { usePortalSession } from "@/components/portal-guard"
import { dateIso, type Id } from "@/components/modules/rh/commun"

import { dateHeureComplete, useAccesSecurite } from "./cadre-securite"
import {
  CATEGORIES_CAUSE,
  DIRECTIONS_RESPONSABLES,
  GRAVITES,
  STATUTS_ACTION,
  STATUTS_ENQUETE,
  libelleType,
  lieuEtPk,
  maintenant,
} from "./libelles"

/**
 * Rapport d'enquête à imprimer (ou enregistrer en PDF) : une page sans
 * coquille. L'impression est tracée au dossier avant d'ouvrir la fenêtre
 * d'impression du navigateur.
 */
export function RapportEnquete({ enqueteId }: { enqueteId: string }) {
  const session = usePortalSession()
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const dossier = useQuery(
    api.modules.securite.enquetes.dossier,
    lecture ? { enqueteId: enqueteId as Id<"securiteEnquetes"> } : "skip"
  )
  const tracer = useMutation(api.modules.securite.enquetes.tracerImpression)
  const [erreur, setErreur] = useState<string | null>(null)
  const [imprimeLe, setImprimeLe] = useState<number | null>(null)
  const lance = useRef(false)

  useEffect(() => {
    if (!dossier || lance.current) return
    lance.current = true
    void (async () => {
      try {
        await tracer({ enqueteId: dossier.enquete._id })
        setImprimeLe(maintenant())
        window.setTimeout(() => window.print(), 400)
      } catch (cause) {
        setErreur(messageErreur(cause, "Impression refusée."))
      }
    })()
  }, [dossier, tracer])

  const user = session?.profile.user
  const retour = `/securite/enquetes/${enqueteId}`

  if (acces && !lecture) {
    return (
      <main className="mx-auto max-w-[900px] bg-surface p-6 text-ink">
        <InlineMessage tone="info" title="Accès restreint">
          Votre profil ne consulte pas les enquêtes de sécurité.
        </InlineMessage>
      </main>
    )
  }
  if (dossier === undefined) {
    return (
      <main className="mx-auto max-w-[900px] bg-surface p-6 text-ink">
        <p role="status" className="text-small text-ink-muted">
          Préparation du rapport…
        </p>
      </main>
    )
  }
  if (dossier === null) {
    return (
      <main className="mx-auto grid max-w-[900px] gap-3 bg-surface p-6 text-ink">
        <InlineMessage tone="danger" title="Rapport indisponible">
          Cette enquête n&apos;existe pas.
        </InlineMessage>
        <Link
          href="/securite/enquetes"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Enquêtes
        </Link>
      </main>
    )
  }

  const { enquete, evenement } = dossier
  return (
    <main className="mx-auto grid max-w-[900px] gap-5 bg-surface p-6 text-[13.5px] text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">
            Rapport d&apos;enquête {enquete.numero}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {evenement.numero} · {libelleType(evenement.type)} ·{" "}
            {STATUTS_ENQUETE[enquete.statut]}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Édité le{" "}
            <span className="tabular">{dateHeureComplete(imprimeLe)}</span>
          </p>
          <p>
            par{" "}
            {user
              ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "—"
              : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link href={retour as Route}>
              <ArrowLeft />
              Retour au dossier
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer />
            Imprimer
          </Button>
        </div>
      </header>

      {erreur ? (
        <InlineMessage tone="danger" title="Impression non tracée">
          {erreur}
        </InlineMessage>
      ) : null}
      {enquete.statut !== "cloturee" ? (
        <p className="rounded-md border border-line-strong px-3 py-2 font-semibold">
          Document de travail : l&apos;enquête n&apos;est pas clôturée (
          {STATUTS_ENQUETE[enquete.statut].toLowerCase()}).
        </p>
      ) : null}

      <section className="grid break-inside-avoid gap-2">
        <h2 className="text-[15px] font-bold">1. Événement</h2>
        <dl className="grid grid-cols-[180px_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">Nature</dt>
          <dd>{libelleType(evenement.type)}</dd>
          <dt className="text-ink-muted">Gravité</dt>
          <dd>{GRAVITES[evenement.gravite]}</dd>
          <dt className="text-ink-muted">Survenu le</dt>
          <dd className="tabular">{dateHeureComplete(evenement.survenuLe)}</dd>
          <dt className="text-ink-muted">Lieu</dt>
          <dd>{lieuEtPk(evenement)}</dd>
          <dt className="text-ink-muted">Train</dt>
          <dd>{evenement.trainNumber ?? "—"}</dd>
          <dt className="text-ink-muted">Victimes</dt>
          <dd>
            {evenement.blesses} blessé(s) · {evenement.deces} décès
          </dd>
          <dt className="text-ink-muted">Déclarant</dt>
          <dd>{evenement.declarantNom}</dd>
        </dl>
        <p className="whitespace-pre-line">{evenement.description}</p>
        {evenement.mesuresImmediates ? (
          <p className="whitespace-pre-line">
            Mesures immédiates : {evenement.mesuresImmediates}
          </p>
        ) : null}
      </section>

      <section className="grid break-inside-avoid gap-2">
        <h2 className="text-[15px] font-bold">2. Enquête</h2>
        <p>
          Ouverte le{" "}
          <span className="tabular">
            {dateHeureComplete(enquete.ouverteLe)}
          </span>{" "}
          par {enquete.ouverteParNom} ; conduite par {enquete.enqueteurNom} ;
          rapport attendu le{" "}
          <span className="tabular">{dateIso(enquete.echeanceRapport)}</span>.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-[15px] font-bold">3. Constats</h2>
        <p className="whitespace-pre-line">
          {enquete.constats ?? "Non renseignés."}
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-[15px] font-bold">4. Causes</h2>
        {enquete.causes.length === 0 ? (
          <p>Aucune cause établie.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">
                  Catégorie
                </th>
                <th scope="col" className="py-1 pr-2">
                  Description
                </th>
                <th scope="col" className="py-1">
                  Racine
                </th>
              </tr>
            </thead>
            <tbody>
              {enquete.causes.map((c, index) => (
                <tr
                  key={index}
                  className="break-inside-avoid border-b border-line align-top"
                >
                  <td className="py-1 pr-2">{CATEGORIES_CAUSE[c.categorie]}</td>
                  <td className="py-1 pr-2">{c.description}</td>
                  <td className="py-1 font-semibold">
                    {c.racine ? "Oui" : "Non"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-[15px] font-bold">5. Recommandations</h2>
        {enquete.recommandations.length === 0 ? (
          <p>Aucune recommandation.</p>
        ) : (
          <ol className="grid list-decimal gap-1 pl-5">
            {enquete.recommandations.map((r, index) => (
              <li key={index}>{r.texte}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-[15px] font-bold">6. Conclusion</h2>
        <p className="whitespace-pre-line">
          {enquete.conclusion ?? "Non rédigée."}
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-[15px] font-bold">
          7. Plan d&apos;actions correctives
        </h2>
        {dossier.actions.length === 0 ? (
          <p>Aucune action inscrite.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">
                  N°
                </th>
                <th scope="col" className="py-1 pr-2">
                  Action
                </th>
                <th scope="col" className="py-1 pr-2">
                  Responsable
                </th>
                <th scope="col" className="py-1 pr-2">
                  Échéance
                </th>
                <th scope="col" className="py-1">
                  État
                </th>
              </tr>
            </thead>
            <tbody>
              {dossier.actions.map((a) => (
                <tr
                  key={a._id}
                  className="break-inside-avoid border-b border-line align-top"
                >
                  <td className="tabular py-1 pr-2">{a.numero}</td>
                  <td className="py-1 pr-2">{a.libelle}</td>
                  <td className="py-1 pr-2">
                    {a.responsableNom} ·{" "}
                    {DIRECTIONS_RESPONSABLES[a.responsableDirection]}
                  </td>
                  <td className="tabular py-1 pr-2">{dateIso(a.echeance)}</td>
                  <td className="py-1">
                    {STATUTS_ACTION[a.statut]} · {a.avancement} %
                    {a.enRetard ? " · en retard" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid break-inside-avoid gap-3">
        <h2 className="text-[15px] font-bold">8. Signatures</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-h-28 content-start gap-1 rounded-md border border-line-strong p-3">
            <b>L&apos;enquêteur désigné</b>
            <span>{enquete.enqueteurNom}</span>
            <span className="text-ink-muted">
              Rapport soumis le{" "}
              <span className="tabular">
                {dateHeureComplete(enquete.soumiseLe)}
              </span>
            </span>
          </div>
          <div className="grid min-h-28 content-start gap-1 rounded-md border border-line-strong p-3">
            <b>L&apos;inspecteur sécurité (clôture)</b>
            <span>{enquete.clotureeParNom ?? "—"}</span>
            <span className="text-ink-muted">
              Clôturée le{" "}
              <span className="tabular">
                {dateHeureComplete(enquete.clotureeLe)}
              </span>
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
