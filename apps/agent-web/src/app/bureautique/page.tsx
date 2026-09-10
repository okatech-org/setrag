"use client"

import { MessageSquare, Video, Mail, Plus } from "lucide-react"
import { EnterpriseShell } from "@/components/enterprise-layout"
import { DemoDataNotice } from "@/components/demo-data-notice"
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

export default function BureautiquePage() {
  return (
    <EnterpriseShell
      title="Bureautique d'Entreprise, GED Légale & Collaboration Unifiée"
      subtitle="Gestion Électronique des Documents, Circuit de Parapheur Électronique pour visas/signatures, Messagerie d'Équipe et Visioconférence WebRTC"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <Video className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
            Lancer Réunion Visio WebRTC
          </Button>
          <Button size="sm" className="bg-[#0F2C59] text-white">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nouveau Document au Parapheur
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <DemoDataNotice scope="Documents, circuits de visa et indicateurs GED fictifs, sans pièce probante réelle." />
        {/* KPI Bureautique */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-line bg-surface p-4">
            <span className="text-xs text-ink-muted">
              Documents en Attente de Visa / Signature
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">
                5 Dossiers
              </span>
              <span className="text-xs font-semibold text-ink-muted">
                Mon Parapheur
              </span>
            </div>
            <p className="text-ink-subtle mt-1 text-[11px]">
              2 Ordres de mission, 2 Bons de commande, 1 PV
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <span className="text-xs text-ink-muted">
              Fonds Documentaire GED Classé
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">14 820</span>
              <span className="text-xs font-semibold text-emerald-600">
                Documents
              </span>
            </div>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Contrats, Plans techniques voies, Bilans OHADA
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <span className="text-xs text-ink-muted">
              Canaux de Messagerie Sécurisée
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">
                32 Canaux
              </span>
              <span className="text-xs font-semibold text-emerald-600">
                Actifs
              </span>
            </div>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Par gare (#owendo, #booue), par convoi et par direction
            </p>
          </Card>

          <Card className="border-line bg-surface p-4">
            <span className="text-xs text-ink-muted">
              Courrier Officiel (Arrivée / Départ)
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#0F2C59]">100 %</span>
              <span className="text-xs font-semibold text-emerald-600">
                Indexé
              </span>
            </div>
            <p className="text-ink-subtle mt-1 text-[11px]">
              Traçabilité courriers Ministère, ARTF, COMILOG
            </p>
          </Card>
        </div>

        {/* Tableau du Parapheur Électronique */}
        <Card className="overflow-hidden border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <h2 className="text-base font-bold text-[#0F2C59]">
                Circuit de Parapheur Électronique (Visas & Signatures en Cours)
              </h2>
              <p className="text-xs text-ink-muted">
                Validation dématérialisée des actes administratifs, ordres
                d’achat et missions
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-[#0F2C59] font-bold text-[#0F2C59]"
            >
              Circuit simulé
            </Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-surface-raised">
                <TableHead>Réf Dossier</TableHead>
                <TableHead>Type d’Acte</TableHead>
                <TableHead>Objet du Document</TableHead>
                <TableHead>Émetteur</TableHead>
                <TableHead>Circuit de Validation</TableHead>
                <TableHead>Date Dépôt</TableHead>
                <TableHead>Action Requise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">
                  DOC-2026-1042
                </TableCell>
                <TableCell className="font-semibold">
                  Ordre de Mission
                </TableCell>
                <TableCell>
                  Mission d’inspection technique voie PK 220-260 (Zone Lopé)
                </TableCell>
                <TableCell>DINFRA / Chef Brigade Voie</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-ink-muted">
                    Chef Service (OK) → Dir. DINFRA (En cours) → DG
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">09/09 09:15</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  >
                    Viser / Signer
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">
                  DOC-2026-1039
                </TableCell>
                <TableCell className="font-semibold">Bon de Commande</TableCell>
                <TableCell>
                  Achat 120 semelles de frein composite pour wagons trémies
                </TableCell>
                <TableCell>DMAT / Ateliers Owendo</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-ink-muted">
                    Acheteur (OK) → DFC / Contrôle (OK) → DGA
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">08/09 16:40</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  >
                    Viser / Signer
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs font-bold text-[#0F2C59]">
                  DOC-2026-1031
                </TableCell>
                <TableCell className="font-semibold">
                  Bordereau Forestier
                </TableCell>
                <TableCell>
                  Validation conformité BSF Rougier 420 m³ Okoumé
                  (Lastoursville)
                </TableCell>
                <TableCell>DCFV / Guichet Fret</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-ink-muted">
                    Agent Fret (OK) → Eaux & Forêts (Validé)
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">07/09 11:20</TableCell>
                <TableCell>
                  <Badge className="bg-emerald-600 text-[10px] text-white">
                    Archivé Probatoire
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>

        {/* Espace Collaboration & Canaux internes */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
              <MessageSquare className="h-4 w-4 text-[#D39E00]" />
              Messagerie d’Équipe & Canaux d’Exploitation
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Discussions en temps réel sécurisées : canal général de crise,
              fils de discussion par gare (#gare-ndjole, #atelier-booue,
              #regie-owendo) et échange instantané de photos d’inspection.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" className="h-7 text-xs">
                Ouvrir le Chat Général
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs">
                Canal #Crise-Exploitation
              </Button>
            </div>
          </Card>

          <Card className="border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
              <Mail className="h-4 w-4 text-blue-600" />
              Courriers Officiels Entrants & Sortants (BOC)
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Registre d’enregistrement du Bureau d’Ordre Central : notification
              des délais de réponse réglementaire ARTF, Ministère des Transports
              et transmission numérisée aux directions.
            </p>
            <div className="mt-3 flex gap-2">
              <Badge className="bg-blue-600 text-[10px] text-white">
                Zéro Perte de Courrier
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Délai moyen réponse : 48h
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </EnterpriseShell>
  )
}
