import Link from "next/link"

import {
  moduleAccessLevelLabel,
  type ModuleAccessLevel,
} from "@workspace/backend/modules"
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

import { ContinuityPanel } from "../continuity-panel"
import { periodLabel } from "../executive-period"
import { MetricCard, MetricGrid } from "../metric-card"
import { ProvenanceSummary, ProvenanceTag } from "../provenance"
import type { ExecutiveVoletProps } from "./types"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

type HealthSeverity = "info" | "avertissement" | "critique"

const HEALTH_SEVERITY_LABELS: Readonly<Record<HealthSeverity, string>> = {
  info: "Nominal",
  avertissement: "Avertissement",
  critique: "Critique",
}

const HEALTH_SEVERITY_TONES: Readonly<
  Record<HealthSeverity, "success" | "warning" | "danger">
> = {
  info: "success",
  avertissement: "warning",
  critique: "danger",
}

function accessLevelLabel(level: ModuleAccessLevel | null): string {
  return level === null ? "Aucun" : moduleAccessLevelLabel(level)
}

const INCIDENT_CATEGORY_LABELS = [
  ["securite", "Sécurité"],
  ["technique", "Technique"],
  ["comportement", "Comportement"],
  ["medical", "Médical"],
  ["autre", "Autre"],
] as const

const INCIDENT_SEVERITY_LABELS = [
  ["critique", "Critique"],
  ["important", "Important"],
  ["information", "Information"],
] as const

const PENALTY_STATUS_LABELS = [
  ["emis", "Émis"],
  ["paye", "Payé"],
  ["conteste", "Contesté"],
  ["annule", "Annulé"],
] as const

const PENALTY_REASON_LABELS = [
  ["sans_titre", "Sans titre"],
  ["titre_invalide", "Titre invalide"],
  ["classe_superieure", "Classe supérieure"],
  ["autre", "Autre"],
] as const

/** Effectifs agrégés d'une dimension, avec montant quand il existe. */
function CountTable({
  caption,
  header,
  rows,
}: {
  caption: string
  header: string
  rows: readonly {
    key: string
    label: string
    count: number
    amountXaf?: number
  }[]
}) {
  const withAmount = rows.some((row) => row.amountXaf !== undefined)
  return (
    <Table className="caption-top">
      <TableCaption className="mt-0 mb-2 text-left font-semibold text-ink">
        {caption}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{header}</TableHead>
          <TableHead className="text-right">Nombre</TableHead>
          {withAmount ? (
            <TableHead className="text-right">Montant</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {NUMBER_FORMATTER.format(row.count)}
            </TableCell>
            {withAmount ? (
              <TableCell className="text-right font-mono tabular-nums">
                {NUMBER_FORMATTER.format(row.amountXaf ?? 0)} FCFA
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
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

/** Volet « Risques et continuité » — PCA/PRA, supervision et sécurité ferroviaire. */
export function RisksVolet({ data }: ExecutiveVoletProps) {
  const continuity = data.continuity
  const health = data.health
  const safety = data.safety
  const safetySummary = safety.summary
  const hasSecuriteModule = data.modules.some(
    (module) => module.code === "securite"
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section
        aria-labelledby="risks-continuite-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="risks-continuite-titre" className="text-h4">
            Continuité PCA/PRA
          </h2>
          <ProvenanceTag state={continuity.state} />
        </div>
        {continuity.summary ? (
          <ContinuityPanel summary={continuity.summary} />
        ) : continuity.state === "unavailable" ? (
          <UnavailableNotice description="Votre habilitation ne couvre pas cette source. L’administration peut l’attribuer en lecture." />
        ) : continuity.state === "empty" ? (
          <EmptyState
            title="Aucune politique PCA/PRA approuvée"
            description="Le registre n’a pas encore de politique approuvée avec des preuves d’exercice."
            action={
              hasSecuriteModule ? (
                <Button asChild variant="secondary">
                  <Link href="/securite">Ouvrir le module Sécurité</Link>
                </Button>
              ) : undefined
            }
          />
        ) : continuity.state === "loading" ? (
          <p role="status" className="text-small text-ink-muted">
            Lecture du registre PCA/PRA en cours…
          </p>
        ) : continuity.state === "not_connected" ? (
          <p className="text-small text-ink-muted">
            Non raccordé : aucun registre PCA/PRA n’alimente encore cette vue.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="risks-sante-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="risks-sante-titre" className="text-h4">
            Santé du système
          </h2>
          <ProvenanceTag state={health.state} />
        </div>
        {health.state === "operational" || health.state === "synthetic_demo" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Tag tone={HEALTH_SEVERITY_TONES[health.severity ?? "info"]}>
                {HEALTH_SEVERITY_LABELS[health.severity ?? "info"]}
              </Tag>
              {health.checkedAt !== undefined ? (
                <span className="text-caption text-ink-muted">
                  vérifié le{" "}
                  {DATE_TIME_FORMATTER.format(new Date(health.checkedAt))}
                </span>
              ) : null}
            </div>
            {health.findings.length > 0 ? (
              <Table>
                <TableCaption>Constats de supervision</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Constat</TableHead>
                    <TableHead>Sévérité</TableHead>
                    <TableHead className="text-right">Occurrences</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health.findings.map((finding) => (
                    <TableRow key={finding.code}>
                      <TableCell>{finding.label}</TableCell>
                      <TableCell>
                        <Tag tone={HEALTH_SEVERITY_TONES[finding.severity]}>
                          {HEALTH_SEVERITY_LABELS[finding.severity]}
                        </Tag>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {NUMBER_FORMATTER.format(finding.count)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-small text-ink-muted">Aucun constat ouvert.</p>
            )}
          </>
        ) : health.state === "unavailable" ? (
          <UnavailableNotice description="Votre habilitation ne couvre pas cette source. L’administration peut l’attribuer en lecture." />
        ) : health.state === "loading" ? (
          <p role="status" className="text-small text-ink-muted">
            Lecture de la supervision en cours…
          </p>
        ) : health.state === "not_connected" ? (
          <p className="text-small text-ink-muted">
            Non raccordé : aucune supervision n’alimente encore cette vue.
          </p>
        ) : (
          <p className="text-small text-ink-muted">Aucun constat ouvert.</p>
        )}
      </section>

      <section
        aria-labelledby="risks-incidents-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="risks-incidents-titre" className="text-h4">
            Incidents et procès-verbaux
          </h2>
          <ProvenanceTag state={safety.state} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Tag tone="neutral">
            {periodLabel(data.period.preset, data.period)}
          </Tag>
          <span className="text-caption text-ink-muted">
            Synthèse agrégée et anonyme : les registres nominatifs (identités,
            descriptions, photos) restent réservés aux fonctions de contrôle et
            de sécurité.
          </span>
        </div>
        {safety.state === "operational" && safetySummary ? (
          <>
            {safetySummary.truncated ? (
              <p className="text-small rounded-md bg-warning-soft px-4 py-3 text-warning-ink">
                Lecture plafonnée à 5 000 lignes par registre : les effectifs
                affichés sont des minimums.
              </p>
            ) : null}
            <MetricGrid
              label="Incidents et procès-verbaux"
              className="xl:grid-cols-4"
            >
              <MetricCard
                label="Incidents signalés"
                state={safety.state}
                value={NUMBER_FORMATTER.format(safetySummary.incidents.total)}
                supporting={`dont ${NUMBER_FORMATTER.format(safetySummary.incidents.open)} non résolus`}
              />
              <MetricCard
                label="Critiques non résolus"
                state={safety.state}
                value={NUMBER_FORMATTER.format(
                  safetySummary.incidents.criticalOpen
                )}
              />
              <MetricCard
                label="Procès-verbaux"
                state={safety.state}
                value={NUMBER_FORMATTER.format(safetySummary.penalties.total)}
                supporting={`dont ${NUMBER_FORMATTER.format(safetySummary.penalties.byStatus.conteste.count)} contestés`}
              />
              <MetricCard
                label="Montant des procès-verbaux"
                state={safety.state}
                value={NUMBER_FORMATTER.format(
                  safetySummary.penalties.amountXaf
                )}
                unit="FCFA"
                supporting={`hors annulations · ${NUMBER_FORMATTER.format(safetySummary.penalties.byStatus.paye.amountXaf)} FCFA payés`}
              />
            </MetricGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              <CountTable
                caption="Incidents par catégorie"
                header="Catégorie"
                rows={INCIDENT_CATEGORY_LABELS.map(([key, label]) => ({
                  key,
                  label,
                  count: safetySummary.incidents.byCategory[key],
                }))}
              />
              <CountTable
                caption="Incidents par gravité"
                header="Gravité"
                rows={INCIDENT_SEVERITY_LABELS.map(([key, label]) => ({
                  key,
                  label,
                  count: safetySummary.incidents.bySeverity[key],
                }))}
              />
              <CountTable
                caption="Procès-verbaux par statut"
                header="Statut"
                rows={PENALTY_STATUS_LABELS.map(([key, label]) => ({
                  key,
                  label,
                  count: safetySummary.penalties.byStatus[key].count,
                  amountXaf: safetySummary.penalties.byStatus[key].amountXaf,
                }))}
              />
              <CountTable
                caption="Procès-verbaux par motif"
                header="Motif"
                rows={PENALTY_REASON_LABELS.map(([key, label]) => ({
                  key,
                  label,
                  count: safetySummary.penalties.byReason[key],
                }))}
              />
            </div>
          </>
        ) : safety.state === "empty" ? (
          <EmptyState
            title="Aucun incident ni procès-verbal enregistré sur la période"
            description="Les signalements proviennent de l’application de contrôle à bord ; élargissez la période pour remonter plus loin."
          />
        ) : safety.state === "loading" ? (
          <p role="status" className="text-small text-ink-muted">
            Lecture de la synthèse en cours…
          </p>
        ) : (
          <UnavailableNotice
            description={
              safetySummary?.scope === "restreint"
                ? "Votre affectation est limitée à un site : la synthèse réseau n’est pas ouverte."
                : "Votre habilitation ne couvre pas le module Sécurité. L’administration peut l’attribuer en lecture."
            }
          />
        )}
      </section>

      <section
        aria-labelledby="risks-securite-environnement-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="risks-securite-environnement-titre" className="text-h4">
            Sécurité ferroviaire et environnement
          </h2>
          <ProvenanceTag state="not_connected" />
        </div>
        <p className="text-small text-ink-muted">
          Le registre des événements de sécurité ARTF et le suivi
          environnemental (Parc de la Lopé) ne sont pas encore dans le système.
          Une vue de démonstration existe, sans valeur officielle.
        </p>
        {hasSecuriteModule ? (
          <Button asChild variant="secondary" className="w-fit">
            <Link href="/securite">Ouvrir la démonstration Sécurité</Link>
          </Button>
        ) : null}
      </section>

      <section
        aria-labelledby="risks-habilitations-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="risks-habilitations-titre" className="text-h4">
          Habilitations de ce compte
        </h2>
        {data.modules.length > 0 ? (
          <ul className="grid gap-2">
            {data.modules.map((module) => (
              <li
                key={module.code}
                className="text-small rounded-md border border-line p-3 text-ink"
              >
                {module.label} · {accessLevelLabel(module.accessLevel)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-muted">
            Aucun module visible pour ce compte.
          </p>
        )}
        <Button asChild variant="secondary" className="w-fit">
          <Link href="/administration">Ouvrir l’administration des accès</Link>
        </Button>
      </section>

      <ProvenanceSummary
        states={[continuity.state, health.state, safety.state]}
      />
    </div>
  )
}
