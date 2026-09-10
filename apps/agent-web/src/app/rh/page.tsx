"use client"

import {
  CalendarCheck,
  CreditCard,
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

export default function RhPage() {
  return (
    <EnterpriseShell
      title="Direction des Ressources Humaines (DRH) · Paie & Droit Social Gabon"
      subtitle="Gestion des 1 500+ agents du Transgabonais selon le Code du Travail (Loi n°022/2021), roulements ferroviaires 3x8, cotisations CNSS & CNAMGS"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
            Planning Roulements 3x8
          </Button>
          <Button size="sm" className="bg-[#0F2C59] text-white">
            <CreditCard className="mr-1.5 h-3.5 w-3.5 text-[#D39E00]" />
            Lancer Calcul Paie Mensuelle
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI RH */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Effectif Cheminot Actif</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">1 548</span>
              <span className="text-xs font-semibold text-emerald-600">Cheminots</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Roulants (28%), Traction/Ateliers (32%), Voies (24%), Tertiaire (16%)
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Déclarations CNSS (Plafond 1.5M FCFA)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">Conforme</span>
              <span className="text-xs font-semibold text-ink-muted">Mois N-1</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Prestations familiales (8%), Risques pro (4%), Retraite (5%+2.5%)
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">CNAMGS (Assurance Maladie)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">100 %</span>
              <span className="text-xs font-semibold text-emerald-600">Télédéclaré</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Couverture santé des cheminots et ayants-droit
            </p>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <span className="text-xs text-ink-muted">Visites Médicales d’Aptitude (Owendo)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">96,4 %</span>
              <span className="text-xs font-semibold text-amber-600">12 rappels</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              Habilitation sécurité obligatoire conducteurs/régulateurs
            </p>
          </Card>
        </div>

        {/* Tableau des roulements de quart et conducteurs */}
        <Card className="border-line bg-surface overflow-hidden">
          <div className="border-b border-line p-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0F2C59]">
                Planification des Roulements Conducteurs & Personnel Roulant
              </h2>
              <p className="text-xs text-ink-muted">
                Contrôle strict des temps de repos post-conduite et des découchés
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-600 text-emerald-700">
              Sécurité Ferroviaire Active
            </Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-surface-raised">
                <TableHead>Matricule</TableHead>
                <TableHead>Collaborateur</TableHead>
                <TableHead>Fonction</TableHead>
                <TableHead>Gare d’Attache</TableHead>
                <TableHead>Affectation Convoi</TableHead>
                <TableHead>Temps Conduite Déjà Effectué</TableHead>
                <TableHead>Repos Réglementaire</TableHead>
                <TableHead>Statut Habilitation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">MAT-0842</TableCell>
                <TableCell className="font-semibold">M. OBAME Guy-Roger</TableCell>
                <TableCell>Conducteur Titulaire Ligne</TableCell>
                <TableCell>Owendo (PK 0)</TableCell>
                <TableCell className="font-mono font-bold text-xs">TM-804 (Moanda)</TableCell>
                <TableCell className="font-mono text-xs">4h 15min / max 6h</TableCell>
                <TableCell><Badge variant="outline" className="text-emerald-700 bg-emerald-50 text-[10px]">Conforme (12h avant départ)</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-600 text-white text-[10px]">Apte Médical CMS</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">MAT-1109</TableCell>
                <TableCell className="font-semibold">Mme MOUSSAVOU Carine</TableCell>
                <TableCell>Régulatrice de Quart COTRAF</TableCell>
                <TableCell>Booué (PK 338)</TableCell>
                <TableCell className="font-mono font-bold text-xs">Poste Central Booué</TableCell>
                <TableCell className="font-mono text-xs">Quart 14h-22h (En cours)</TableCell>
                <TableCell><Badge variant="outline" className="text-emerald-700 bg-emerald-50 text-[10px]">Repos 16h validé</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-600 text-white text-[10px]">Apte Médical CMS</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">MAT-0621</TableCell>
                <TableCell className="font-semibold">M. NDONG Jean-Fidèle</TableCell>
                <TableCell>Conducteur Fret Forestier</TableCell>
                <TableCell>Lastoursville (PK 485)</TableCell>
                <TableCell className="font-mono font-bold text-xs">TF-312 (Grumier)</TableCell>
                <TableCell className="font-mono text-xs">Fin de quart Booué</TableCell>
                <TableCell><Badge className="bg-amber-600 text-white text-[10px]">En Découché Cité Booué</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-600 text-white text-[10px]">Apte Médical CMS</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </EnterpriseShell>
  )
}
