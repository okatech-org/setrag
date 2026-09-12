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
          <ProvenanceTag state="unavailable" />
        </div>
        <p className="text-small text-ink-muted">
          Les incidents à bord et les procès-verbaux ne sont pas accessibles à
          ce compte (ressources incidents et proces_verbaux). L’attribution en
          lecture est une décision DSI/SSI.
        </p>
        <Button asChild variant="secondary" className="w-fit">
          <Link href="/administration">Voir mes habilitations</Link>
        </Button>
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

      <ProvenanceSummary states={[continuity.state, health.state]} />
    </div>
  )
}
