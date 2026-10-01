import {
  Armchair,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  Cog,
  Construction,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  House,
  Landmark,
  LayoutDashboard,
  Luggage,
  Package,
  Plug,
  Radio,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tags,
  Ticket,
  TrainFront,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import type { AppRole } from "@workspace/backend/permissions"
import type { ModuleCode } from "@workspace/backend/modules"

import {
  EXECUTIVE_PATH,
  MODULE_ADMINISTRATION_PATH,
  canAccessManagementPath,
  canAccessSalePath,
} from "@/lib/portal-access"

/**
 * Menu du portail agent — une seule source pour la barre latérale, le fil
 * d'Ariane et les raccourcis clavier. Chaque entrée porte son icône : une
 * entrée sans icône est un oubli, pas un choix.
 */
export interface EntreeMenu {
  href: string
  libelle: string
  icone: LucideIcon
  /**
   * Touche du raccourci clavier par défaut ; l'agent peut la changer ou la
   * retirer dans ses réglages. Les accueils (« /vente », « /gestion ») n'en
   * ont pas : le logo y ramène.
   */
  touche?: string
  /** Chemins supplémentaires qui rendent l'entrée courante. */
  aussi?: readonly string[]
}

export interface GroupeMenu {
  cle: string
  libelle: string
  espace: "vente" | "gestion"
  entrees: readonly EntreeMenu[]
}

export const GROUPES_MENU: readonly GroupeMenu[] = [
  {
    cle: "guichet",
    libelle: "Guichet",
    espace: "vente",
    entrees: [
      { href: "/vente", libelle: "Accueil", icone: House },
      {
        href: "/vente/billet",
        libelle: "Vendre un billet",
        icone: Ticket,
        touche: "B",
        aussi: ["/vente/encaissement", "/vente/confirmation"],
      },
      { href: "/vente/bagage", libelle: "Bagage", icone: Luggage, touche: "G" },
      {
        href: "/vente/colis",
        libelle: "Colis express",
        icone: Package,
        touche: "C",
      },
      {
        href: "/vente/prestation-speciale",
        libelle: "Prestations spéciales",
        icone: Truck,
        touche: "P",
      },
      {
        href: "/vente/operations",
        libelle: "Après-vente",
        icone: RotateCcw,
        touche: "R",
      },
      {
        href: "/vente/ventes-manuelles",
        libelle: "Ventes manuelles",
        icone: FileText,
        touche: "M",
      },
      {
        href: "/vente/caisse",
        libelle: "Caisse",
        icone: Calculator,
        touche: "K",
      },
    ],
  },
  {
    cle: "pilotage",
    libelle: "Pilotage",
    espace: "gestion",
    entrees: [
      { href: "/gestion", libelle: "Tableau de bord", icone: LayoutDashboard },
    ],
  },
  {
    cle: "exploitation",
    libelle: "Exploitation",
    espace: "gestion",
    entrees: [
      {
        href: "/gestion/livrets",
        libelle: "Livrets horaires",
        icone: BookOpen,
        touche: "L",
      },
      {
        href: "/gestion/trains",
        libelle: "Trains et voitures",
        icone: TrainFront,
        touche: "T",
      },
      {
        href: "/gestion/places",
        libelle: "Places et quotas",
        icone: Armchair,
        touche: "P",
      },
    ],
  },
  {
    cle: "commercial",
    libelle: "Commercial",
    espace: "gestion",
    entrees: [
      { href: "/gestion/tarifs", libelle: "Tarifs", icone: Tags, touche: "A" },
      {
        href: "/gestion/yield",
        libelle: "Yield",
        icone: TrendingUp,
        touche: "Y",
      },
      {
        href: "/gestion/points-de-vente",
        libelle: "Points de vente",
        icone: Store,
        touche: "G",
      },
      {
        href: "/gestion/voyageurs",
        libelle: "Voyageurs",
        icone: Users,
        touche: "V",
      },
      {
        href: "/gestion/apres-vente",
        libelle: "Après-vente",
        icone: RotateCcw,
        touche: "R",
      },
    ],
  },
  {
    cle: "finances",
    libelle: "Recettes et comptes",
    espace: "gestion",
    entrees: [
      {
        href: "/gestion/recettes",
        libelle: "Recettes",
        icone: HandCoins,
        touche: "E",
      },
      {
        href: "/gestion/comptabilite",
        libelle: "Comptabilité",
        icone: FileSpreadsheet,
        touche: "C",
      },
      {
        href: "/gestion/rapports",
        libelle: "Rapports",
        icone: BarChart3,
        touche: "X",
      },
    ],
  },
  {
    cle: "supervision",
    libelle: "Supervision",
    espace: "gestion",
    entrees: [
      {
        href: "/gestion/incidents",
        libelle: "Incidents et PV",
        icone: TriangleAlert,
        touche: "I",
      },
      {
        href: "/gestion/utilisateurs",
        libelle: "Utilisateurs",
        icone: UserCog,
        touche: "U",
      },
      {
        href: "/gestion/audit",
        libelle: "Journal d'audit",
        icone: History,
        touche: "J",
      },
      {
        href: "/gestion/parametrage",
        libelle: "Paramétrage",
        icone: SlidersHorizontal,
        touche: "S",
      },
      {
        href: "/gestion/integrations",
        libelle: "Intégrations",
        icone: Plug,
        touche: "N",
      },
    ],
  },
]

/** Icône de chaque module du SI intégré (le module Voyageurs, c'est la gestion). */
export const ICONES_MODULES: Record<ModuleCode, LucideIcon> = {
  voyageurs: Ticket,
  fret: Boxes,
  cotraf: Radio,
  gmao: Wrench,
  infrastructure: Construction,
  finance: Landmark,
  rh: Users,
  ged: FileText,
  securite: ShieldCheck,
  copilot: Sparkles,
}

/** Touche par défaut de chaque module, dans l'ordre du menu. */
export const TOUCHES_MODULES: Record<ModuleCode, string | undefined> = {
  voyageurs: undefined,
  fret: "1",
  cotraf: "2",
  gmao: "3",
  infrastructure: "4",
  finance: "5",
  rh: "6",
  ged: "7",
  securite: "8",
  copilot: "9",
}

/** Espaces transverses, rendus après les modules. */
export const ENTREES_TRANSVERSES: readonly (EntreeMenu & { cle: string })[] = [
  {
    cle: "direction",
    href: EXECUTIVE_PATH,
    libelle: "Direction générale",
    icone: Building2,
    touche: "D",
  },
  {
    cle: "etudes",
    href: "/etudes",
    libelle: "Audit et documents",
    icone: ScrollText,
    touche: "0",
  },
  {
    cle: "administration",
    href: MODULE_ADMINISTRATION_PATH,
    libelle: "Administration",
    icone: Cog,
    touche: "M",
  },
]

export function chemineVers(href: string, chemin: string) {
  return chemin === href || chemin.startsWith(`${href}/`)
}

/** L'entrée est-elle ouverte au rôle ? Mêmes gardes que les pages. */
export function entreeAutorisee(
  role: AppRole,
  groupe: GroupeMenu,
  entree: EntreeMenu
) {
  return groupe.espace === "vente"
    ? canAccessSalePath(role, entree.href)
    : canAccessManagementPath(role, entree.href)
}

/**
 * Entrée courante : la plus spécifique qui couvre le chemin. « /vente » et
 * « /gestion » ne couvrent que leur propre page, pas leurs sous-rubriques.
 */
export function entreeCourante(chemin: string, entrees: readonly EntreeMenu[]) {
  let meilleure: EntreeMenu | undefined
  let longueur = -1
  for (const entree of entrees) {
    const candidats = [entree.href, ...(entree.aussi ?? [])]
    for (const href of candidats) {
      const racine = href === "/vente" || href === "/gestion"
      const couvre = racine ? chemin === href : chemineVers(href, chemin)
      if (couvre && href.length > longueur) {
        meilleure = entree
        longueur = href.length
      }
    }
  }
  return meilleure
}
