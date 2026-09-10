"use client"

import {
  Plus,
  Disc,
} from "lucide-react"
import { EnterpriseShell } from "@/components/enterprise-layout"
import { Card } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function MaterielPage() {
  return (
    <EnterpriseShell
      title="Direction du Matériel Roulant (DMAT) · GMAO Ferroviaire"
      subtitle="Supervision de la maintenance préventive et curative des parcs de locomotives (GE/EMD) et wagons (Ateliers d'Owendo et Booué)"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <Disc className="mr-1.5 h-3.5 w-3.5" />
            Tour en Fosse (Essieux)
          </Button>
          <Button size="sm" className="bg-[#0F2C59] text-white">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nouvel Ordre de Travail (OT)
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI GMAO */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Disponibilité Locomotives</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">88,4 %</span>
              <span className="text-xs font-semibold text-emerald-600">38 / 43 actives</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              3 en grande révision, 2 en maintenance légère
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Parc Wagons Trémies (COMILOG)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">93,1 %</span>
              <span className="text-xs font-semibold text-emerald-600">1 120 / 1 200</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Visites périodiques boîtes d’essieux conformes
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Wagons Plats & Grumiers</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">91,5 %</span>
              <span className="text-xs font-semibold text-emerald-600">248 / 271</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Ranchers et attaches contrôlés
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Ordres de Travail en Cours</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">14 OT</span>
              <span className="text-xs font-medium text-ink-muted">Atelier Owendo</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              6 OT Booué (relai traction)
            </p>
          </Card>
        </div>

        {/* Ordres de travail prioritaires */}
        <Card className="border-line bg-surface overflow-hidden">
          <div className="border-b border-line p-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0F2C59]">
                Ordres de Travail de Maintenance (OT) Réseau
              </h2>
              <p className="text-xs text-ink-muted">
                Dernières interventions déclarées par les équipes d’ateliers et de ligne
              </p>
            </div>
            <Badge variant="outline">GMAO Temps Réel</Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-surface-raised">
                <TableHead>N° OT</TableHead>
                <TableHead>Engin / Équipement</TableHead>
                <TableHead>Nature de l’Avarie</TableHead>
                <TableHead>Site d’Intervention</TableHead>
                <TableHead>Date Début</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono font-bold text-[#0F2C59]">OT-2026-089</TableCell>
                <TableCell className="font-semibold">Locomotive GE GT46MAC #CC-204</TableCell>
                <TableCell>Échauffement palier turbo-compresseur</TableCell>
                <TableCell>Atelier Central Owendo</TableCell>
                <TableCell className="font-mono text-xs">08/09 14:30</TableCell>
                <TableCell><Badge className="bg-red-600 text-white text-[10px]">Critique</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-amber-700 bg-amber-50 text-[10px]">Pièces en montage</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono font-bold text-[#0F2C59]">OT-2026-087</TableCell>
                <TableCell className="font-semibold">Rame 12 Wagons Trémies Manganèse</TableCell>
                <TableCell>Reprofilage roues (usure boudin d’essieu)</TableCell>
                <TableCell>Tour en Fosse Owendo</TableCell>
                <TableCell className="font-mono text-xs">07/09 08:00</TableCell>
                <TableCell><Badge className="bg-amber-600 text-white text-[10px]">Moyen</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-600 text-white text-[10px]">Contrôle qualité</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono font-bold text-[#0F2C59]">OT-2026-085</TableCell>
                <TableCell className="font-semibold">Voiture Voyageurs VIP #V-102</TableCell>
                <TableCell>Climatisation réversible & groupe électrogène</TableCell>
                <TableCell>Dépôt Voyageurs Owendo</TableCell>
                <TableCell className="font-mono text-xs">06/09 10:15</TableCell>
                <TableCell><Badge className="bg-blue-600 text-white text-[10px]">Normal</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-600 text-white text-[10px]">Clôturé / Validé</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </EnterpriseShell>
  )
}
