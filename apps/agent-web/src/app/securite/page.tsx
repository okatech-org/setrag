"use client"

import type { FunctionReturnType } from "convex/server"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Leaf,
  ShieldCheck,
} from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { EnterpriseShell } from "@/components/enterprise-layout"
import { DemoDataNotice } from "@/components/demo-data-notice"

const EVENTS = [
  {
    reference: "EVT-2026-118",
    date: "09 sept. · 18:42",
    location: "PK 201 · Mbel",
    category: "Obstacle sur emprise",
    status: "Enquête ouverte",
    owner: "Sécurité + DINFRA",
  },
  {
    reference: "EVT-2026-115",
    date: "08 sept. · 06:15",
    location: "Gare de Booué",
    category: "Écart procédure de manœuvre",
    status: "Action corrective",
    owner: "DEF",
  },
  {
    reference: "EVT-2026-109",
    date: "05 sept. · 22:08",
    location: "PK 258 · Parc de la Lopé",
    category: "Présence faune sur voie",
    status: "Clôturé",
    owner: "COTRAF + environnement",
  },
] as const

const CORRECTIVE_ACTIONS = [
  {
    action: "Sécuriser le drainage du talus PK 201",
    source: "EVT-2026-118",
    due: "12 sept. 2026",
    progress: "65 %",
    status: "En cours",
  },
  {
    action: "Recycler les équipes de manœuvre de Booué",
    source: "EVT-2026-115",
    due: "18 sept. 2026",
    progress: "40 %",
    status: "Planifiée",
  },
  {
    action: "Mettre à jour le protocole faune nocturne",
    source: "EVT-2026-109",
    due: "10 sept. 2026",
    progress: "100 %",
    status: "Vérifiée",
  },
] as const

type ContinuitySummary = FunctionReturnType<
  typeof api.modules.continuity.queries.getContinuitySummary
>

const CONTINUITY_GAP_LABELS: Record<
  ContinuitySummary["policies"][number]["readiness"]["gaps"][number],
  string
> = {
  objectifs_invalides: "Objectifs à corriger",
  politique_non_approuvee: "Politique non approuvée",
  reprise_non_mesuree_ou_hors_objectifs: "Reprise non prouvée",
  autonomie_hors_ligne_non_prouvee: "Autonomie hors ligne non prouvée",
  procedure_papier_non_testee: "Repli papier non testé",
}

function ContinuityPanel({ summary }: { summary: ContinuitySummary }) {
  return (
    <Card className="overflow-hidden border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-[#0F2C59]">Préparation PCA / PRA</h2>
          <p className="text-xs text-ink-muted">
            Objectifs de reprise, autonomie hors ligne et repli papier
          </p>
        </div>
        {summary.provenanceState === "synthetic_demo" ? (
          <Badge
            variant="outline"
            className="w-fit border-amber-300 bg-amber-50 text-amber-900"
          >
            Données synthétiques · Démonstration
          </Badge>
        ) : (
          <Badge variant="outline">
            {summary.readyPolicyCount} / {summary.evaluatedPolicyCount} prêts
          </Badge>
        )}
      </div>

      {summary.dataset ? (
        <div className="border-b border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
          <span className="font-semibold">{summary.dataset.label}.</span>{" "}
          {summary.dataset.notice}
        </div>
      ) : null}

      {summary.policies.length === 0 ? (
        <div className="p-4 text-sm text-ink-muted">
          Aucune politique approuvée n’est disponible dans le registre.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-raised">
                <TableHead>Périmètre</TableHead>
                <TableHead>Objectifs</TableHead>
                <TableHead>État probant</TableHead>
                <TableHead>Écarts à traiter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.policies.map(({ policy, readiness }) => (
                <TableRow key={policy._id}>
                  <TableCell>
                    <p className="text-xs font-semibold text-[#0F2C59]">
                      {policy.title}
                    </p>
                    <p className="font-mono text-[11px] text-ink-muted">
                      {policy.policyCode} · v{policy.version}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">
                    RPO {policy.rpoSeconds.toLocaleString("fr-FR")} s · RTO{" "}
                    {policy.rtoMinutes.toLocaleString("fr-FR")} min · hors ligne{" "}
                    {policy.offlineAutonomyHours} h
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        readiness.ready
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                      }
                    >
                      {readiness.ready ? "Prêt et prouvé" : "À renforcer"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-ink-muted">
                    {readiness.gaps.length === 0
                      ? "Aucun écart dans la fenêtre évaluée"
                      : readiness.gaps
                          .map((gap) => CONTINUITY_GAP_LABELS[gap])
                          .join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}

export default function SecurityPage() {
  const continuitySummary = useQuery(
    api.modules.continuity.queries.getContinuitySummary,
    { policyLimit: 8 }
  )

  return (
    <EnterpriseShell
      title="Sécurité ferroviaire, conformité & environnement"
      subtitle="Vue de synthèse du registre des événements, des enquêtes, des actions correctives et du suivi ARTF sur le Transgabonais"
      actions={
        <Badge
          variant="outline"
          className="border-[#D39E00]/70 bg-[#D39E00]/10 text-[#0F2C59]"
        >
          Vue de synthèse · Démonstration
        </Badge>
      }
    >
      <div className="space-y-6">
        <DemoDataNotice scope="Événements, enquêtes, actions correctives et indicateurs ARTF simulés." />
        <section
          aria-label="Indicateurs de sécurité"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Événements ouverts
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-[#0F2C59]">7</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Aucun événement classé critique dans cette synthèse
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Enquêtes en instruction
              </span>
              <FileSearch className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-[#0F2C59]">4</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Analyse des causes et pièces justificatives suivies
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Actions correctives à échéance
              </span>
              <ClipboardCheck className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-700">5</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Responsables, preuves et dates butoirs consolidés
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Conformité du plan ARTF
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-700">94 %</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Contrôles et justificatifs de sécurité disponibles
            </p>
          </Card>
        </section>

        {continuitySummary ? (
          <ContinuityPanel summary={continuitySummary} />
        ) : (
          <Card
            role="status"
            aria-label="Chargement de la préparation PCA PRA"
            className="border-line bg-surface p-4 text-sm text-ink-muted"
          >
            Chargement du registre PCA / PRA…
          </Card>
        )}

        <Card className="overflow-hidden border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-[#0F2C59]">
                Registre des événements ferroviaires
              </h2>
              <p className="text-xs text-ink-muted">
                Traçabilité de démonstration des signalements et enquêtes
              </p>
            </div>
            <Badge variant="outline">Registre de synthèse</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-raised">
                  <TableHead>Référence / date</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Pilotage</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EVENTS.map((event) => (
                  <TableRow key={event.reference}>
                    <TableCell>
                      <p className="font-mono text-xs font-bold text-[#0F2C59]">
                        {event.reference}
                      </p>
                      <p className="text-[11px] text-ink-muted">{event.date}</p>
                    </TableCell>
                    <TableCell className="text-xs">{event.location}</TableCell>
                    <TableCell className="text-xs font-medium">
                      {event.category}
                    </TableCell>
                    <TableCell className="text-xs">{event.owner}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {event.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden border-line bg-surface">
            <div className="border-b border-line p-4">
              <h2 className="flex items-center gap-2 font-bold text-[#0F2C59]">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-700"
                  aria-hidden
                />
                Enquêtes & actions correctives
              </h2>
              <p className="text-xs text-ink-muted">
                Suivi de la clôture et de la vérification d’efficacité
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-raised">
                    <TableHead>Action</TableHead>
                    <TableHead>Événement source</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Avancement</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CORRECTIVE_ACTIONS.map((item) => (
                    <TableRow key={item.action}>
                      <TableCell className="max-w-72 text-xs font-medium">
                        {item.action}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.source}
                      </TableCell>
                      <TableCell className="text-xs">{item.due}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">
                        {item.progress}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#0F2C59]">
                  Corridor du Parc national de la Lopé
                </h2>
                <p className="text-xs text-ink-muted">
                  Surveillance environnementale · PK 240–270
                </p>
              </div>
              <Leaf className="h-5 w-5 text-emerald-700" aria-hidden />
            </div>

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-sm font-bold text-emerald-900">
                Niveau de vigilance nominal
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
                Les passages de trains de nuit, observations de faune et alertes
                des éco-gardes sont consolidés dans cette vue.
              </p>
            </div>

            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-2">
                <dt className="text-ink-muted">Présence faune · 24 h</dt>
                <dd className="font-semibold text-[#0F2C59]">
                  2 observations suivies
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-2">
                <dt className="text-ink-muted">Alertes éco-gardes</dt>
                <dd className="font-semibold text-emerald-700">
                  Aucune active
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Prochaine revue</dt>
                <dd className="font-semibold text-[#0F2C59]">
                  Comité environnement
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </EnterpriseShell>
  )
}
