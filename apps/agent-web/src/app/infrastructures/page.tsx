"use client"

import {
  Activity,
  AlertTriangle,
  Construction,
  MapPin,
  Radio,
  Ruler,
} from "lucide-react"

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

const PRN_SECTIONS = [
  {
    section: "Owendo · Ndjolé",
    pk: "PK 0–182",
    progress: "94 %",
    geometry: "Conforme",
    status: "Réception ciblée",
  },
  {
    section: "Ndjolé · Booué",
    pk: "PK 182–338",
    progress: "81 %",
    geometry: "2 zones sous surveillance",
    status: "Travaux en cours",
  },
  {
    section: "Booué · Lastoursville",
    pk: "PK 338–485",
    progress: "68 %",
    geometry: "Bourrage programmé",
    status: "Fenêtres COTRAF",
  },
  {
    section: "Lastoursville · Franceville",
    pk: "PK 485–648",
    progress: "57 %",
    geometry: "Relevés en consolidation",
    status: "Préparation PRN",
  },
] as const

const ASSET_ALERTS = [
  {
    asset: "Talus de Mbel",
    location: "PK 201+400",
    observation: "Drainage renforcé après pluies intenses",
    monitoring: "Inspection quotidienne",
    level: "Vigilance",
  },
  {
    asset: "Pont sur l’Ogooué",
    location: "PK 278+100",
    observation: "Appareils d’appui suivis par instrumentation",
    monitoring: "Mesure hebdomadaire",
    level: "Suivi",
  },
  {
    asset: "Tranchée rocheuse Lopé",
    location: "PK 256+800",
    observation: "Filets pare-blocs contrôlés",
    monitoring: "Ronde après intempéries",
    level: "Stable",
  },
] as const

export default function InfrastructuresPage() {
  return (
    <EnterpriseShell
      title="Installations fixes & Programme de Remise à Niveau"
      subtitle="Vue de synthèse du corridor PK 0–648 : voie, ouvrages, talus, signalisation, passages à niveau et télécommunications"
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
        <section
          aria-label="Indicateurs du réseau"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Linéaire supervisé
              </span>
              <MapPin className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-[#0F2C59]">648 km</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              De la gare d’Owendo au terminus de Franceville
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Avancement consolidé PRN
              </span>
              <Construction className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-[#0F2C59]">76 %</p>
            <p className="mt-1 text-[11px] text-emerald-700">
              Traverses béton, ballast et renouvellement de voie
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Géométrie de voie conforme
              </span>
              <Ruler className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-[#0F2C59]">96,8 %</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Nivellement, dressage, écartement et dévers consolidés
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">
                Équipements disponibles
              </span>
              <Radio className="h-4 w-4 text-[#D39E00]" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-700">98,4 %</p>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Signalisation, PN, fibre optique et radio sol-train
            </p>
          </Card>
        </section>

        <Card className="overflow-hidden border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-[#0F2C59]">
                Suivi kilométrique du PRN et de la géométrie de voie
              </h2>
              <p className="text-xs text-ink-muted">
                Consolidation des fenêtres travaux sur l’ensemble du corridor
              </p>
            </div>
            <Badge variant="outline">Situation de démonstration</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-raised">
                  <TableHead>Section</TableHead>
                  <TableHead>Repères</TableHead>
                  <TableHead>Avancement PRN</TableHead>
                  <TableHead>Géométrie de voie</TableHead>
                  <TableHead>Coordination</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PRN_SECTIONS.map((section) => (
                  <TableRow key={section.section}>
                    <TableCell className="font-semibold text-[#0F2C59]">
                      {section.section}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {section.pk}
                    </TableCell>
                    <TableCell className="font-mono font-bold">
                      {section.progress}
                    </TableCell>
                    <TableCell className="text-xs">
                      {section.geometry}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {section.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <Card className="overflow-hidden border-line bg-surface">
            <div className="border-b border-line p-4">
              <h2 className="flex items-center gap-2 font-bold text-[#0F2C59]">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                Ouvrages d’art et talus sous surveillance
              </h2>
              <p className="text-xs text-ink-muted">
                Synthèse des observations terrain et rythmes d’inspection
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-raised">
                    <TableHead>Actif / PK</TableHead>
                    <TableHead>Observation</TableHead>
                    <TableHead>Surveillance</TableHead>
                    <TableHead>Niveau</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ASSET_ALERTS.map((item) => (
                    <TableRow key={item.asset}>
                      <TableCell>
                        <p className="font-semibold text-[#0F2C59]">
                          {item.asset}
                        </p>
                        <p className="font-mono text-[11px] text-ink-muted">
                          {item.location}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        {item.observation}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.monitoring}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {item.level}
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
                  Signalisation, PN & télécoms
                </h2>
                <p className="text-xs text-ink-muted">
                  État agrégé des installations fixes
                </p>
              </div>
              <Activity className="h-5 w-5 text-emerald-700" aria-hidden />
            </div>
            <div className="mt-4 space-y-3">
              {[
                [
                  "Signaux et boucles de détection",
                  "99,1 %",
                  "1 maintenance planifiée",
                ],
                ["Passages à niveau", "97,6 %", "2 contrôles renforcés"],
                ["Radio sol-train VHF", "99,4 %", "Couverture nominale"],
                ["Fibre optique ferroviaire", "98,7 %", "Redondance active"],
              ].map(([label, value, detail]) => (
                <div
                  key={label}
                  className="bg-surface-raised rounded-lg border border-line/70 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#0F2C59]">
                      {label}
                    </p>
                    <span className="font-mono text-xs font-bold text-emerald-700">
                      {value}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">{detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </EnterpriseShell>
  )
}
