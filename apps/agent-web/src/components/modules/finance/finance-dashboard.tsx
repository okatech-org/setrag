"use client"

import type { FunctionReference } from "convex/server"
import {
  BookOpenCheck,
  FileSpreadsheet,
  FlaskConical,
  Landmark,
  Receipt,
  Scale,
} from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { EnterpriseShell } from "@/components/enterprise-layout"

export interface FinanceOverviewDto {
  generatedAt: number
  dataState: "empty" | "synthetic_demo" | "operational"
  dataset: null | {
    label: string
    notice: string
    referencePeriod: string
  }
  configuration: {
    activeRuleSet: null | {
      _id: string
      code: string
      version: number
      validFrom: string
      legalSourceLabel: string
      legalSourceUrl: string
      rules: readonly {
        code: string
        label: string
        rateBasisPoints: number
        basis: string
      }[]
    }
    activeAccounts: number
    totalAccounts: number
  }
  journal: {
    postedBatches: number
    totalDebit: number
    totalCredit: number
    latest: readonly {
      _id: string
      reference: string
      entryDate: string
      label: string
      totalDebit: number
      totalCredit: number
      status: string
    }[]
  }
  readiness: {
    canPrepareTaxReturns: boolean
    blockers: readonly string[]
  }
}

type FinanceOverviewReference = FunctionReference<
  "query",
  "public",
  Record<string, never>,
  FinanceOverviewDto
>

/**
 * Référence dynamique : elle permet de livrer l'interface en parallèle de la
 * régénération de l'API Convex, sans substituer de données locales au serveur.
 */
const financeApi = (
  api as unknown as {
    modules: {
      finance: {
        queries: {
          getFinanceOverview: FinanceOverviewReference
        }
      }
    }
  }
).modules.finance.queries

const FCFA_FORMATTER = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  // Le code « XAF », comme partout dans la charte, plutôt que le symbole.
  currencyDisplay: "code",
  maximumFractionDigits: 0,
})

const RATE_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
})

const GENERATED_AT_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

export function formatFcfa(amount: number) {
  return FCFA_FORMATTER.format(amount)
}

export function formatBasisPoints(rateBasisPoints: number) {
  return `${RATE_FORMATTER.format(rateBasisPoints / 100)} %`
}

function FinanceDashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement des données financières"
      className="grid gap-4"
    >
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function FinanceActions({
  readiness,
}: {
  readiness: FinanceOverviewDto["readiness"]
}) {
  const disabled = !readiness.canPrepareTaxReturns
  const explanation =
    readiness.blockers.length > 0
      ? readiness.blockers.join(" · ")
      : "Les prérequis de production fiscale ne sont pas encore validés."

  return (
    <section aria-labelledby="finance-actions-title" className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="finance-actions-title" className="text-h3">
            Production réglementaire
          </h2>
          <p className="text-small mt-1 text-ink-muted">
            Les éditions ne sont disponibles que lorsque le référentiel et les
            écritures sont prêts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            title={disabled ? explanation : undefined}
          >
            <FileSpreadsheet aria-hidden />
            Préparer la liasse OHADA
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            title={disabled ? explanation : undefined}
          >
            <Receipt aria-hidden />
            Préparer la déclaration fiscale
          </Button>
        </div>
      </div>

      {disabled ? (
        <InlineMessage tone="warning" title="Production fiscale bloquée.">
          {explanation}
        </InlineMessage>
      ) : (
        <InlineMessage tone="success" title="Préparation autorisée.">
          Les contrôles de disponibilité déclarés par le serveur sont
          satisfaits.
        </InlineMessage>
      )}
    </section>
  )
}

function ConfigurationPanel({
  configuration,
}: {
  configuration: FinanceOverviewDto["configuration"]
}) {
  const ruleSet = configuration.activeRuleSet

  return (
    <Card className="border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <Scale aria-hidden className="size-5 text-ink-muted" />
          Référentiel comptable et fiscal
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line p-4">
            <p className="text-caption text-ink-muted">Comptes actifs</p>
            <p className="text-h3 mt-1 tabular-nums">
              {configuration.activeAccounts.toLocaleString("fr-FR")} /{" "}
              {configuration.totalAccounts.toLocaleString("fr-FR")}
            </p>
          </div>
          <div className="rounded-md border border-line p-4">
            <p className="text-caption text-ink-muted">Jeu de règles actif</p>
            <p className="mt-1 font-semibold text-ink">
              {ruleSet ? `${ruleSet.code} · v${ruleSet.version}` : "Aucun"}
            </p>
          </div>
        </div>

        {ruleSet ? (
          <div className="grid gap-4">
            <div className="text-small flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-ink-muted">
                Applicable depuis{" "}
                <time dateTime={ruleSet.validFrom}>{ruleSet.validFrom}</time>
              </span>
              <a
                href={ruleSet.legalSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink underline-offset-4 hover:underline"
              >
                {ruleSet.legalSourceLabel}
              </a>
            </div>

            {ruleSet.rules.length > 0 ? (
              <ul className="grid gap-2" aria-label="Règles fiscales actives">
                {ruleSet.rules.map((rule) => (
                  <li
                    key={rule.code}
                    className="grid gap-1 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <span>
                      <span className="font-semibold text-ink">
                        {rule.label}
                      </span>
                      <span className="text-caption block text-ink-muted">
                        {rule.code} · Assiette : {rule.basis}
                      </span>
                    </span>
                    <Badge variant="outline" className="w-fit tabular-nums">
                      {formatBasisPoints(rule.rateBasisPoints)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-ink-muted">
                Ce jeu de règles ne contient aucun taux actif.
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            title="Aucun référentiel actif"
            description="Aucune règle comptable ou fiscale ne peut être appliquée tant qu’un jeu de règles daté et sourcé n’est pas activé."
            action={
              <span className="text-caption text-ink-subtle">
                Aucun taux réglementaire n’est supposé par l’interface.
              </span>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

function JournalPanel({ journal }: { journal: FinanceOverviewDto["journal"] }) {
  return (
    <Card className="min-w-0 overflow-hidden border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <BookOpenCheck aria-hidden className="size-5 text-ink-muted" />
          Journal comptable validé
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-line p-4">
            <p className="text-caption text-ink-muted">Lots comptabilisés</p>
            <p className="text-h3 mt-1 tabular-nums">
              {journal.postedBatches.toLocaleString("fr-FR")}
            </p>
          </div>
          <div className="rounded-md border border-line p-4">
            <p className="text-caption text-ink-muted">Total débit</p>
            <p className="mt-1 font-semibold text-ink tabular-nums">
              {formatFcfa(journal.totalDebit)}
            </p>
          </div>
          <div className="rounded-md border border-line p-4">
            <p className="text-caption text-ink-muted">Total crédit</p>
            <p className="mt-1 font-semibold text-ink tabular-nums">
              {formatFcfa(journal.totalCredit)}
            </p>
          </div>
        </div>

        {journal.latest.length > 0 ? (
          <div className="relative overflow-x-auto">
            <Table>
              <TableCaption>Derniers lots comptables validés.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Débit</TableHead>
                  <TableHead className="text-right">Crédit</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journal.latest.map((batch) => (
                  <TableRow key={batch._id}>
                    <TableCell>
                      <time dateTime={batch.entryDate}>{batch.entryDate}</time>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">
                      {batch.reference}
                    </TableCell>
                    <TableCell>{batch.label}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatFcfa(batch.totalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatFcfa(batch.totalCredit)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{batch.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="Aucune écriture comptable validée"
            description="Les totaux restent à zéro tant qu’aucun lot équilibré n’a été comptabilisé par le serveur."
            action={
              <span className="text-caption text-ink-subtle">
                Aucune écriture de démonstration n’est affichée.
              </span>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

export function FinanceDashboardScreen({
  overview,
}: {
  overview: FinanceOverviewDto | undefined
}) {
  if (overview === undefined) {
    return (
      <InlineMessage tone="danger" title="Données financières indisponibles.">
        Le serveur n’a renvoyé aucun état financier exploitable. Aucun montant
        de substitution n’est affiché.
      </InlineMessage>
    )
  }

  return (
    <div className="grid gap-6">
      {overview.dataState === "synthetic_demo" && overview.dataset ? (
        <InlineMessage
          tone="warning"
          title="Données synthétiques de démonstration"
        >
          <span className="flex items-start gap-2">
            <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {overview.dataset.notice} Période du scénario :{" "}
              {overview.dataset.referencePeriod}.
            </span>
          </span>
        </InlineMessage>
      ) : null}

      <Card className="border-line bg-surface">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <Landmark aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-ink">
                {overview.dataState === "synthetic_demo"
                  ? overview.dataset?.label
                  : "Données comptables serveur"}
              </p>
              <p className="text-small text-ink-muted">
                {overview.dataState === "synthetic_demo"
                  ? "Scénario pédagogique persisté côté serveur et isolé par des références DEMO-."
                  : "Les indicateurs proviennent exclusivement des écritures persistées côté serveur."}
              </p>
            </div>
          </div>
          <p className="text-caption text-ink-muted">
            Généré le{" "}
            <time dateTime={new Date(overview.generatedAt).toISOString()}>
              {GENERATED_AT_FORMATTER.format(overview.generatedAt)}
            </time>
          </p>
        </CardContent>
      </Card>

      <FinanceActions readiness={overview.readiness} />
      <ConfigurationPanel configuration={overview.configuration} />
      <JournalPanel journal={overview.journal} />
    </div>
  )
}

export function FinanceDashboardPage() {
  const overview = useQuery(financeApi.getFinanceOverview, {})

  return (
    <EnterpriseShell
      title="Direction Financière & Comptable"
      subtitle="Comptabilité SYSCOHADA et préparation fiscale fondées exclusivement sur les référentiels actifs"
    >
      {overview === undefined ? (
        <FinanceDashboardLoading />
      ) : (
        <FinanceDashboardScreen overview={overview} />
      )}
    </EnterpriseShell>
  )
}
