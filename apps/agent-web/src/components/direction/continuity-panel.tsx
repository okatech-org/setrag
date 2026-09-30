import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import { Tag } from "@workspace/ui/components/tag"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { ContinuitySummary } from "./executive-dto"
import { ProvenanceTag } from "./provenance"

/** Écarts de préparation PCA/PRA, libellés stables pour la lecture d'audit. */
export const CONTINUITY_GAP_LABELS: Record<
  ContinuitySummary["policies"][number]["readiness"]["gaps"][number],
  string
> = {
  objectifs_invalides: "Objectifs à corriger",
  politique_non_approuvee: "Politique non approuvée",
  reprise_non_mesuree_ou_hors_objectifs: "Reprise non prouvée",
  autonomie_hors_ligne_non_prouvee: "Autonomie hors ligne non prouvée",
  procedure_papier_non_testee: "Repli papier non testé",
}

/**
 * Registre PCA/PRA (politiques, objectifs, preuves, écarts) — extrait de
 * `app/securite/page.tsx` pour être partagé avec le volet « Risques et
 * continuité » de la Direction générale.
 */
export function ContinuityPanel({ summary }: { summary: ContinuitySummary }) {
  return (
    <Card className="overflow-hidden border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-ink">Préparation PCA / PRA</h3>
          <p className="text-xs text-ink-muted">
            Objectifs de reprise, autonomie hors ligne et repli papier
          </p>
        </div>
        {summary.provenanceState === "synthetic_demo" ? (
          <ProvenanceTag state="synthetic_demo" />
        ) : (
          <Badge variant="outline">
            {summary.readyPolicyCount} / {summary.evaluatedPolicyCount} prêts
          </Badge>
        )}
      </div>

      {summary.dataset ? (
        <div className="border-b border-warning-ink/40 bg-warning-soft px-4 py-3 text-xs text-warning-ink">
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
            <TableCaption className="sr-only">
              Politiques de continuité, objectifs et preuves d’exercice
            </TableCaption>
            <TableHeader>
              <TableRow className="bg-surface-sunk">
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
                    <p className="text-xs font-semibold text-ink">
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
                    <Tag tone={readiness.ready ? "success" : "warning"}>
                      {readiness.ready ? "Prêt et prouvé" : "À renforcer"}
                    </Tag>
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
