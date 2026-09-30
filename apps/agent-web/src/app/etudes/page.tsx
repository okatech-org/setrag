"use client"

import { Download, FileCode, Award } from "lucide-react"
import { DocumentButton } from "@/components/document-button"
import { EnterpriseShell } from "@/components/enterprise-layout"
import { Card } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"

const DOCUMENTS = [
  {
    num: "01",
    id: "01_AUDIT_PORTAIL_AGENT_EXISTANT",
    title: "Audit Exhaustif du Portail Agent Existant & Analyse des Écarts",
    tag: "Audit Technique",
    desc: "Analyse ligne par ligne du portail agent-web, couverture billetterie existante et matrice des écarts (Gap Analysis) vers l'ERP ferroviaire complet.",
    pages: "9 pages",
    pdfSize: "576 Ko",
  },
  {
    num: "02",
    id: "02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG",
    title: "Étude des Métiers du Rail & Typologie des Transports au Gabon",
    tag: "Fret & Économie",
    desc: "Analyse approfondie du fret minier (7 Mt manganèse COMILOG), fret forestier (grumes/bois Nkok), hydrocarbures citernes et voyageurs en voie unique.",
    pages: "7 pages",
    pdfSize: "380 Ko",
  },
  {
    num: "03",
    id: "03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES",
    title: "Cartographie des Acteurs Internes & Parties Prenantes Externes",
    tag: "Gouvernance",
    desc: "Cartographie détaillée des 1 500+ collaborateurs (DEF, COTRAF, DMAT, DINFRA, DFC, DRH) et des intervenants externes (COMILOG, Meridiam, ARTF, Douanes, DGI, CNSS).",
    pages: "8 pages",
    pdfSize: "500 Ko",
  },
  {
    num: "04",
    id: "04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES",
    title: "Architecture du Système d'Exploitation Global (ERP 10 Modules)",
    tag: "Architecture SI",
    desc: "Spécification détaillée des 10 modules métiers : Fret, COTRAF, GMAO, PRN, Finances, RH, Bureautique/GED, Parapheur électronique et IA Copilot.",
    pages: "9 pages",
    pdfSize: "515 Ko",
  },
  {
    num: "05",
    id: "05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON",
    title: "Cadre Réglementaire : Normes OHADA, Fiscalité & Droit Social Gabon",
    tag: "Conformité Légale",
    desc: "Application stricte du SYSCOHADA révisé (classes 1 à 9), de la fiscalité gabonaise (TVA 18%, CSS 1%, retenues 9.5%) et du Code du Travail (IRPP, TCS 5%, CNSS, CNAMGS).",
    pages: "7 pages",
    pdfSize: "429 Ko",
  },
  {
    num: "06",
    id: "06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION",
    title: "Feuille de Route Stratégique, Plan d'Implémentation & PCA/PRA",
    tag: "Direction Projet",
    desc: "Planning prévisionnel en 4 phases (Mois 1 à 20), matrice RACI, architecture technique temps réel et plan de continuité d'activité (PCA/PRA).",
    pages: "7 pages",
    pdfSize: "428 Ko",
  },
  {
    num: "DG",
    id: "RECETTE_ESPACE_DIRECTION_GENERALE",
    title: "Dossier de recette — Espace Direction générale",
    tag: "Recette DG",
    desc: "Scénarios de recette des cinq volets, décisions déjà prises, questions d’orientation à trancher et grille de visa de la Direction générale.",
    pages: "5 pages",
    pdfSize: "305 Ko",
  },
  {
    num: "MASTER",
    id: "LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE",
    title: "LIVRE BLANC — Système d'Exploitation d'Entreprise Intégré SETRAG",
    tag: "Livre Blanc DG",
    desc: "Document de synthèse stratégique officiel destiné à la Direction Générale et au Conseil d'Administration (Eramet/COMILOG, Meridiam, État Gabonais).",
    pages: "12 pages",
    pdfSize: "389 Ko",
    isMaster: true,
  },
]

export default function EtudesPage() {
  return (
    <EnterpriseShell
      title="Centre d'Audit, d'Études & Documents Officiels"
      subtitle="Documentation complète de l'architecture d'entreprise SETRAG aux formats Markdown (.md) et PDF Imprimables (.pdf)"
    >
      <div className="space-y-6">
        {/* Bannière de synthèse */}
        <div className="rounded-xl border border-[#D39E00]/40 bg-gradient-to-r from-[#0F2C59] to-[#1E3A8A] p-6 text-white shadow-md">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Award className="h-6 w-6 text-[#D39E00]" />
                <h2 className="text-lg font-extrabold tracking-wide uppercase">
                  Dossier Stratégique Officiel · SETRAG 2026
                </h2>
              </div>
              <p className="max-w-2xl text-sm text-white/80">
                7 études exhaustives d’ingénierie des systèmes ferroviaires,
                d’analyse financière OHADA, de conformité juridique gabonaise et
                de gouvernance du Transgabonais.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DocumentButton
                file="LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE.pdf"
                className="min-h-11 bg-[#D39E00] font-bold text-slate-900 hover:bg-[#D39E00]/90"
              >
                <Download className="mr-2 h-4 w-4" />
                Télécharger le Livre Blanc (.pdf)
              </DocumentButton>
            </div>
          </div>
        </div>

        {/* Grille des documents */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DOCUMENTS.map((doc) => (
            <Card
              key={doc.id}
              className={`flex flex-col justify-between p-5 transition-all hover:shadow-md ${
                doc.isMaster
                  ? "border-2 border-[#D39E00] bg-[#FFFBEB]/40 dark:bg-slate-900/40"
                  : "border-line bg-surface"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={
                      doc.isMaster
                        ? "border-[#D39E00] bg-[#D39E00] font-bold text-slate-900"
                        : "bg-surface-raised border-line text-xs font-semibold text-ink-muted"
                    }
                  >
                    {doc.tag}
                  </Badge>
                  <span className="text-ink-subtle font-mono text-xs">
                    {doc.pages} · {doc.pdfSize}
                  </span>
                </div>

                <h3 className="text-base leading-snug font-bold text-[#0F2C59]">
                  {doc.title}
                </h3>

                <p className="text-xs leading-relaxed text-ink-muted">
                  {doc.desc}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-line/60 pt-4">
                <DocumentButton
                  file={`${doc.id}.md`}
                  variant="secondary"
                  className="min-h-11 flex-1 text-xs font-medium"
                >
                  <FileCode className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                  Source .md
                </DocumentButton>
                <DocumentButton
                  file={`${doc.id}.pdf`}
                  className="min-h-11 flex-1 bg-[#0F2C59] text-xs font-semibold text-white hover:bg-[#0F2C59]/90"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5 text-[#D39E00]" />
                  Format .pdf
                </DocumentButton>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </EnterpriseShell>
  )
}
