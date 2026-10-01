// Génère convex/modules/etudes/corpus.ts — le texte des études et du dossier
// de recette, embarqué dans le bundle Convex pour que le seed le charge en
// base (bibliothèque consultable, recherche, annotations).
//
//   cd packages/backend && bun scripts/generer-corpus-etudes.mjs
//
// Relancer après toute modification d'une étude : la source fait foi
// (`apps/agent-web/documents/*.md`, servis aussi en .md/.pdf par la route
// `/documents/[name]`, et `docs/etude-erp-setrag/07_…`). Le seed recharge
// ensuite le contenu dont l'empreinte a changé.

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ici = dirname(fileURLToPath(import.meta.url))
const racine = join(ici, "..", "..", "..")
const documents = join(racine, "apps", "agent-web", "documents")
const etudes = join(racine, "docs", "etude-erp-setrag")

const CATALOGUE = [
  {
    code: "01_AUDIT_PORTAIL_AGENT_EXISTANT",
    numero: "01",
    titre: "Audit du portail agent existant et analyse des écarts",
    categorie: "Audit technique",
    resume:
      "Analyse du portail agent-web, couverture de la billetterie existante et matrice des écarts vers le système intégré.",
    source: documents,
    pdf: true,
  },
  {
    code: "02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG",
    numero: "02",
    titre: "Métiers du rail et typologie des transports au Gabon",
    categorie: "Fret et économie",
    resume:
      "Fret minier, fret forestier, hydrocarbures et voyageurs sur une voie unique : les métiers et leurs contraintes.",
    source: documents,
    pdf: true,
  },
  {
    code: "03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES",
    numero: "03",
    titre: "Cartographie des acteurs internes et des parties prenantes",
    categorie: "Gouvernance",
    resume:
      "Directions de la SETRAG et intervenants externes : clients, régulateur, administrations, bailleurs.",
    source: documents,
    pdf: true,
  },
  {
    code: "04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES",
    numero: "04",
    titre: "Architecture du système d'exploitation intégré (dix modules)",
    categorie: "Architecture SI",
    resume:
      "Spécification des dix modules métier : fret, COTRAF, GMAO, infrastructures, finances, RH, bureautique et GED, Copilot, sécurité.",
    source: documents,
    pdf: true,
  },
  {
    code: "05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON",
    numero: "05",
    titre: "Cadre réglementaire : OHADA, fiscalité et droit social gabonais",
    categorie: "Conformité légale",
    resume:
      "Règles de gestion issues du SYSCOHADA révisé, de la fiscalité gabonaise et du code du travail, à valider par la DFC.",
    source: documents,
    pdf: true,
  },
  {
    code: "06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION",
    numero: "06",
    titre: "Feuille de route, plan d'implémentation et continuité d'activité",
    categorie: "Direction de projet",
    resume: "Phasage prévisionnel, matrice RACI, architecture technique et plan de continuité (PCA/PRA).",
    source: documents,
    pdf: true,
  },
  {
    code: "07_PLAN_IMPLEMENTATION_BACK_OFFICE_SETRAG",
    numero: "07",
    titre: "Plan d'implémentation exécutable du back-office",
    categorie: "Direction de projet",
    resume:
      "Monolithe modulaire livré par flux métier complets : socle, vagues de livraison, backlog et risques.",
    source: etudes,
    pdf: false,
  },
  {
    code: "RECETTE_ESPACE_DIRECTION_GENERALE",
    numero: "DG",
    titre: "Dossier de recette — espace Direction générale",
    categorie: "Recette",
    resume:
      "Scénarios de recette des cinq volets, décisions prises, questions d'orientation et grille de visa de la Direction générale.",
    source: documents,
    pdf: true,
  },
  {
    code: "LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE",
    numero: "LB",
    titre: "Livre blanc — système d'exploitation intégré SETRAG",
    categorie: "Livre blanc",
    resume:
      "Document de synthèse stratégique destiné à la Direction générale et au conseil d'administration.",
    source: documents,
    pdf: true,
  },
]

const entrees = CATALOGUE.map((entree, ordre) => {
  const contenu = readFileSync(join(entree.source, `${entree.code}.md`), "utf8").replace(/\r\n/g, "\n")
  return {
    code: entree.code,
    numero: entree.numero,
    titre: entree.titre,
    categorie: entree.categorie,
    resume: entree.resume,
    fichierMd: `${entree.code}.md`,
    fichierPdf: entree.pdf ? `${entree.code}.pdf` : null,
    ordre,
    empreinte: createHash("sha256").update(contenu).digest("hex"),
    contenu,
  }
})

const sortie = `// Généré par scripts/generer-corpus-etudes.mjs — ne pas modifier à la main.
// Texte des études SETRAG, chargé en base par modules/etudes/seed.ts.

export interface EtudeCorpus {
  code: string
  numero: string
  titre: string
  categorie: string
  resume: string
  fichierMd: string
  fichierPdf: string | null
  ordre: number
  empreinte: string
  contenu: string
}

export const CORPUS_ETUDES: readonly EtudeCorpus[] = ${JSON.stringify(entrees, null, 2)}
`

writeFileSync(join(ici, "..", "convex", "modules", "etudes", "corpus.ts"), sortie)
console.log(`corpus.ts : ${entrees.length} études, ${entrees.reduce((n, e) => n + e.contenu.length, 0)} caractères.`)
