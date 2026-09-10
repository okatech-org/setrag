"use client"

import {
  FileSpreadsheet,
  Receipt,
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

export default function FinancesPage() {
  return (
    <EnterpriseShell
      title="Direction Financière & Comptable (DFC) · Normes OHADA & Fiscalité Gabon"
      subtitle="Comptabilité générale SYSCOHADA révisé, calcul automatique TVA 18% & CSS 1%, déclarations DGI et liasse financière annuelle"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Liasse Fiscale OHADA
          </Button>
          <Button size="sm" className="bg-[#0F2C59] text-white">
            <Receipt className="mr-1.5 h-3.5 w-3.5 text-[#D39E00]" />
            Déclaration TVA/CSS DGI
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Financiers */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Chiffre d’Affaires Mensuel Estimé</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">4,82 Mds</span>
              <span className="text-xs text-ink-muted font-bold">FCFA</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-semibold">
              Fret minier (72%), Fret bois (14%), Billetterie (14%)
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">TVA Collectée (18 %) · DGI Gabon</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">867,6 M</span>
              <span className="text-xs text-ink-muted font-bold">FCFA</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Déclaration mensuelle e-tax prête pour télé-paiement
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">CSS (Contribution Solidarité 1 %)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">48,2 M</span>
              <span className="text-xs text-ink-muted font-bold">FCFA</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Calculée sur CA taxable pour le Trésor gabonais
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Rapprochement Bancaire & Mobile Money</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">99,8 %</span>
              <span className="text-xs font-semibold text-emerald-600">Conforme</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              BGFI, UGB, Airtel Money, Moov Money
            </p>
          </Card>
        </div>

        {/* Plan comptable et journaux SYSCOHADA */}
        <Card className="border-line bg-surface overflow-hidden">
          <div className="border-b border-line p-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0F2C59]">
                Dernières Écritures au Grand-Livre (SYSCOHADA Révisé)
              </h2>
              <p className="text-xs text-ink-muted">
                Traçabilité intégrale des flux de recettes fret, dépenses PRN et encaissements gares
              </p>
            </div>
            <Badge variant="outline" className="border-[#D39E00] text-[#0F2C59] font-bold">
              SYSCOHADA Strict
            </Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-surface-raised">
                <TableHead>Date / Réf</TableHead>
                <TableHead>Compte Débit</TableHead>
                <TableHead>Compte Crédit</TableHead>
                <TableHead>Libellé de l’Écriture</TableHead>
                <TableHead>Montant Débit (FCFA)</TableHead>
                <TableHead>Montant Crédit (FCFA)</TableHead>
                <TableHead>Journal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">09/09 · EC-4891</TableCell>
                <TableCell className="font-mono text-xs font-semibold text-[#0F2C59]">411100 (COMILOG)</TableCell>
                <TableCell className="font-mono text-xs text-ink-muted">706100 (Fret Minier)</TableCell>
                <TableCell className="text-xs font-medium">Facturation convoi TM-804 Moanda-Owendo (9 240 t)</TableCell>
                <TableCell className="font-mono font-bold">147 840 000</TableCell>
                <TableCell className="font-mono font-bold">147 840 000</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">Ventes Fret</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">09/09 · EC-4890</TableCell>
                <TableCell className="font-mono text-xs font-semibold text-[#0F2C59]">521100 (BGFI Bank)</TableCell>
                <TableCell className="font-mono text-xs text-ink-muted">581000 (Virement Fds)</TableCell>
                <TableCell className="text-xs font-medium">Encaissement recettes billetterie guichets Owendo</TableCell>
                <TableCell className="font-mono font-bold">24 150 000</TableCell>
                <TableCell className="font-mono font-bold">24 150 000</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">Trésorerie</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">08/09 · EC-4889</TableCell>
                <TableCell className="font-mono text-xs font-semibold text-[#0F2C59]">231200 (Voies PRN)</TableCell>
                <TableCell className="font-mono text-xs text-ink-muted">401100 (Fournisseur)</TableCell>
                <TableCell className="text-xs font-medium">Réception 1 500 traverses béton biblocs (Chantier PK 190)</TableCell>
                <TableCell className="font-mono font-bold">67 500 000</TableCell>
                <TableCell className="font-mono font-bold">67 500 000</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">Immos PRN</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </EnterpriseShell>
  )
}
