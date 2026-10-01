import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tag } from "@workspace/ui/components/tag"

import {
  formatBasisPoints,
  formatFcfa,
} from "@/components/modules/finance/finance-dashboard"

import { BreakdownBars } from "../charts"
import { comparisonLabel } from "../executive-period"
import { MetricCard, MetricGrid } from "../metric-card"
import { ProvenanceSummary, ProvenanceTag } from "../provenance"
import { PassengerPeriodControl } from "./overview"
import type { ExecutiveVoletProps } from "./types"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const PERCENT_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})
const GENERATED_AT_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})
const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "UTC",
})

/** Date calendaire `AAAA-MM-JJ` rendue en toutes lettres, sans dérive de fuseau. */
function formatIsoDay(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? value : DAY_FORMATTER.format(parsed)
}

const BATCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  comptabilise: "Comptabilisé",
  validated: "Validé",
  valide: "Validé",
  draft: "Brouillon",
  brouillon: "Brouillon",
}

function batchStatusLabel(status: string) {
  return (
    BATCH_STATUS_LABELS[status] ??
    status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
  )
}

function revenueVariationSupporting(
  value: number | null | undefined,
  comparison: string
): string | undefined {
  if (value === null) return "Sans période de référence"
  if (value === undefined) return undefined
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${PERCENT_FORMATTER.format(Math.abs(value))} % ${comparison}`
}

/** Source non accessible à ce compte — même traitement partout dans l'espace. */
function UnavailableNotice({ description }: { description: string }) {
  return (
    <EmptyState
      title="Non accessible à ce compte"
      description={description}
      action={
        <Button asChild variant="secondary">
          <Link href="/administration">Voir mes habilitations</Link>
        </Button>
      }
    />
  )
}

/** Volet « Finances » — recettes voyageurs, journal comptable et conformité fiscale. */
export function FinancesVolet({
  data,
  preset,
  onPresetChange,
}: ExecutiveVoletProps) {
  const passenger = data.passenger
  const finance = data.finance
  const overview = finance.overview
  const comparison = comparisonLabel(data.period)
  const ruleSet = overview?.configuration.activeRuleSet
  const canPrepareTaxReturns = overview?.readiness.canPrepareTaxReturns ?? false

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section
        aria-labelledby="finances-recettes-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="finances-recettes-titre" className="text-h4">
          Recettes voyageurs
        </h2>
        <PassengerPeriodControl
          heading={null}
          data={data}
          preset={preset}
          onPresetChange={onPresetChange}
        />
        <MetricGrid
          label="Recettes voyageurs"
          className="sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            label="Recettes nettes"
            state={passenger.state}
            value={
              passenger.revenueNet !== undefined
                ? NUMBER_FORMATTER.format(passenger.revenueNet)
                : undefined
            }
            unit="XAF"
            supporting={
              passenger.state === "operational"
                ? revenueVariationSupporting(
                    passenger.revenueVariationPct,
                    comparison
                  )
                : undefined
            }
          />
          <MetricCard
            label="Remboursements"
            state={passenger.state}
            value={
              passenger.refundedTtc !== undefined
                ? NUMBER_FORMATTER.format(passenger.refundedTtc)
                : undefined
            }
            unit="XAF"
            supporting={
              passenger.state === "operational" &&
              passenger.refundRatePct !== undefined
                ? `${PERCENT_FORMATTER.format(passenger.refundRatePct)} % des recettes brutes`
                : undefined
            }
          />
          <MetricCard
            label="Panier moyen"
            state={passenger.state}
            value={
              passenger.averageBasketTtc !== undefined
                ? NUMBER_FORMATTER.format(passenger.averageBasketTtc)
                : undefined
            }
            unit="XAF"
          />
          <MetricCard
            label="Ventes"
            state={passenger.state}
            value={
              passenger.salesCount !== undefined
                ? NUMBER_FORMATTER.format(passenger.salesCount)
                : undefined
            }
            supporting={
              passenger.state === "operational" &&
              passenger.tickets !== undefined
                ? `${NUMBER_FORMATTER.format(passenger.tickets)} billets`
                : undefined
            }
          />
        </MetricGrid>
        <BreakdownBars
          title="Par produit"
          slices={passenger.byProduct}
          state={passenger.state}
          tableCaption="Recettes nettes par produit"
        />
        <BreakdownBars
          title="Par canal de vente"
          slices={passenger.byChannel}
          state={passenger.state}
          tableCaption="Recettes nettes par canal"
        />
      </section>

      <section
        aria-labelledby="finances-journal-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="finances-journal-titre" className="text-h4">
            Journal comptable
          </h2>
          <ProvenanceTag state={finance.state} />
        </div>
        {finance.generatedAt !== undefined ? (
          <p className="text-caption text-ink-muted">
            Instantané du{" "}
            {GENERATED_AT_FORMATTER.format(new Date(finance.generatedAt))}
          </p>
        ) : null}
        {overview ? (
          <>
            {overview.dataset ? (
              <p className="text-small rounded-md bg-warning-soft px-4 py-3 text-warning-ink">
                <span className="font-semibold">{overview.dataset.label}.</span>{" "}
                {overview.dataset.notice}
              </p>
            ) : null}
            <MetricGrid
              label="Journal comptable"
              className="sm:grid-cols-2 xl:grid-cols-4"
            >
              <MetricCard
                label="Lots validés"
                state={finance.state}
                value={NUMBER_FORMATTER.format(overview.journal.postedBatches)}
              />
              <MetricCard
                label="Total débit"
                state={finance.state}
                value={NUMBER_FORMATTER.format(overview.journal.totalDebit)}
                unit="XAF"
              />
              <MetricCard
                label="Total crédit"
                state={finance.state}
                value={NUMBER_FORMATTER.format(overview.journal.totalCredit)}
                unit="XAF"
              />
              <MetricCard
                label="Comptes actifs"
                state={finance.state}
                value={NUMBER_FORMATTER.format(
                  overview.configuration.activeAccounts
                )}
                supporting={`sur ${NUMBER_FORMATTER.format(overview.configuration.totalAccounts)}`}
              />
            </MetricGrid>
            {overview.journal.latest.length > 0 ? (
              <Table>
                <TableCaption>Derniers lots comptabilisés.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="text-right">Débit</TableHead>
                    <TableHead className="text-right">Crédit</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.journal.latest.map((batch) => (
                    <TableRow key={batch._id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {batch.reference}
                      </TableCell>
                      <TableCell>
                        <time dateTime={batch.entryDate}>
                          {formatIsoDay(batch.entryDate)}
                        </time>
                      </TableCell>
                      <TableCell>{batch.label}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatFcfa(batch.totalDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatFcfa(batch.totalCredit)}
                      </TableCell>
                      <TableCell>
                        <Tag tone="neutral">
                          {batchStatusLabel(batch.status)}
                        </Tag>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="Aucune écriture comptable validée"
                description="Les totaux restent à zéro tant qu’aucun lot équilibré n’a été comptabilisé par le serveur."
              />
            )}
          </>
        ) : finance.state === "unavailable" ? (
          <UnavailableNotice description="Votre habilitation ne couvre pas cette source. L’administration peut l’attribuer en lecture." />
        ) : finance.state === "loading" ? (
          <p role="status" className="text-small text-ink-muted">
            Lecture du journal comptable en cours…
          </p>
        ) : finance.state === "not_connected" ? (
          <p className="text-small text-ink-muted">
            Non raccordé : aucune interface comptable ne remonte encore
            d’écritures dans cette vue.
          </p>
        ) : (
          <EmptyState
            title="Aucune écriture comptable validée"
            description="Les totaux restent à zéro tant qu’aucun lot équilibré n’a été comptabilisé par le serveur."
          />
        )}
      </section>

      <section
        aria-labelledby="finances-fiscal-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="finances-fiscal-titre" className="text-h4">
          Règles fiscales actives
        </h2>
        {ruleSet ? (
          <div className="grid gap-3">
            <p className="text-small text-ink-muted">
              {ruleSet.code} · v{ruleSet.version} · en vigueur depuis{" "}
              <time dateTime={ruleSet.validFrom}>
                {formatIsoDay(ruleSet.validFrom)}
              </time>
            </p>
            <a
              href={ruleSet.legalSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-small w-fit font-semibold text-accent-ink underline-offset-4 hover:underline"
            >
              {ruleSet.legalSourceLabel}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            <ul aria-label="Règles fiscales actives" className="grid gap-2">
              {ruleSet.rules.map((rule) => (
                <li key={rule.code} className="text-small text-ink">
                  {rule.label} · {formatBasisPoints(rule.rateBasisPoints)} ·{" "}
                  {rule.basis}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            title="Aucun référentiel fiscal actif"
            description="Aucune règle fiscale ne peut être appliquée tant qu’un jeu de règles daté et sourcé n’est pas activé."
          />
        )}
      </section>

      <section
        aria-labelledby="finances-prerequis-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="finances-prerequis-titre" className="text-h4">
          Prérequis non établis
        </h2>
        {finance.blockers.length > 0 ? (
          <ol className="grid gap-2">
            {finance.blockers.map((blocker) => (
              <li
                key={blocker}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <span className="text-small text-ink">{blocker}</span>
                <Tag tone="warning">À établir</Tag>
              </li>
            ))}
          </ol>
        ) : finance.state === "operational" ? (
          <p className="text-small text-ink-muted">
            Aucun prérequis en attente.
          </p>
        ) : null}
        <p className="text-small text-ink-muted">
          Déclarations fiscales : préparation{" "}
          {canPrepareTaxReturns ? "ouverte" : "fermée"}
        </p>
      </section>

      <section
        aria-labelledby="finances-non-raccorde-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="finances-non-raccorde-titre" className="text-h4">
          Trésorerie, budget et créances
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid content-start gap-2 rounded-md border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-small font-semibold text-ink">
                Trésorerie et rapprochement bancaire
              </h3>
              <ProvenanceTag state="not_connected" />
            </div>
            <p className="text-caption text-ink-muted">
              SAGE X3 reste le grand-livre maître ; aucun montant n’est repris
              ici tant que l’interface n’est pas homologuée.
            </p>
          </div>
          <div className="grid content-start gap-2 rounded-md border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-small font-semibold text-ink">
                Budget et réalisé
              </h3>
              <ProvenanceTag state="not_connected" />
            </div>
            <p className="text-caption text-ink-muted">
              Le budget et son exécution restent pilotés dans SAGE X3 ; aucun
              montant n’est repris ici tant que l’interface n’est pas
              homologuée.
            </p>
          </div>
          <div className="grid content-start gap-2 rounded-md border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-small font-semibold text-ink">
                Créances fret
              </h3>
              <ProvenanceTag state="not_connected" />
            </div>
            <p className="text-caption text-ink-muted">
              Les créances fret restent suivies dans SAGE X3 ; aucun montant
              n’est repris ici tant que l’interface n’est pas homologuée.
            </p>
          </div>
        </div>
      </section>

      <ProvenanceSummary states={[passenger.state, finance.state]} />
    </div>
  )
}
