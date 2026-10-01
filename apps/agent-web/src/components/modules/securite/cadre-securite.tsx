"use client"

import type { FunctionReturnType } from "convex/server"
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  Clock,
  FileSearch,
  FileText,
  LayoutDashboard,
  Leaf,
  ListChecks,
  Send,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Tag } from "@workspace/ui/components/tag"

import {
  TableSimple,
  CadreModule,
  Statut,
  type RubriqueModule,
  type Ton,
} from "@/components/modules/rh/commun"
import {
  dateCourte,
  heure,
  nombre,
} from "@/components/gestion/referentiels/format"

import {
  GRAVITES,
  GRAVITES_NC,
  RESULTATS_INSPECTION,
  STATUTS_ACTION,
  STATUTS_ARTF,
  STATUTS_ENQUETE,
  STATUTS_EVENEMENT,
  STATUTS_INSPECTION,
  type Gravite,
  type GraviteNc,
  type ResultatInspection,
  type StatutAction,
  type StatutArtf,
  type StatutEnquete,
  type StatutEvenement,
  type StatutInspection,
} from "./libelles"

export type AccesSecurite = FunctionReturnType<
  typeof api.modules.securite.accueil.monAcces
>
export type CapaciteSecurite = AccesSecurite["capacites"][number]

/** Capacités de l'utilisateur dans le module, telles que le serveur les accorde. */
export function useAccesSecurite() {
  const acces = useQuery(api.modules.securite.accueil.monAcces, {})
  return {
    acces,
    charge: acces !== undefined,
    peut: (capacite: CapaciteSecurite) =>
      Boolean(acces?.capacites.includes(capacite)),
  }
}

const RUBRIQUES: readonly (RubriqueModule & {
  capacites: readonly CapaciteSecurite[]
})[] = [
  {
    href: "/securite",
    libelle: "Tableau de bord",
    icone: LayoutDashboard,
    exacte: true,
    capacites: ["indicateurs"],
  },
  {
    href: "/securite/evenements",
    libelle: "Registre des événements",
    icone: ShieldAlert,
    capacites: ["registre.lire", "evenement.declarer"],
  },
  {
    href: "/securite/enquetes",
    libelle: "Enquêtes",
    icone: FileSearch,
    capacites: ["registre.lire"],
  },
  {
    href: "/securite/actions",
    libelle: "Actions correctives",
    icone: ListChecks,
    capacites: ["registre.lire"],
  },
  {
    href: "/securite/inspections",
    libelle: "Inspections et audits",
    icone: ClipboardCheck,
    capacites: ["registre.lire", "environnement.lire"],
  },
  {
    href: "/securite/artf",
    libelle: "Déclarations ARTF",
    icone: Send,
    capacites: ["artf.lire"],
  },
  {
    href: "/securite/environnement",
    libelle: "Environnement · Lopé",
    icone: Leaf,
    capacites: ["environnement.lire"],
  },
]

/** Cadre des écrans Sécurité : rubriques filtrées par capacité, lecture seule écrite. */
export function CadreSecurite({
  titre,
  description,
  actions,
  retour,
  children,
}: {
  titre: ReactNode
  description?: ReactNode
  actions?: ReactNode
  retour?: { href: string; libelle: string }
  children: ReactNode
}) {
  const { acces, peut } = useAccesSecurite()
  const rubriques = RUBRIQUES.filter((rubrique) =>
    acces ? rubrique.capacites.some(peut) : rubrique.exacte
  )
  return (
    <CadreModule
      espace="Sécurité et conformité"
      perimetre="Sécurité ferroviaire · ARTF · ligne Owendo — Franceville"
      rubriques={rubriques}
      titre={titre}
      description={description}
      actions={actions}
      retour={retour}
      lectureSeule={
        acces?.lectureSeule
          ? acces.interne
            ? "Consultation : votre profil lit le registre de sécurité sans pouvoir le modifier. Recherches, exports et impressions restent disponibles."
            : "Partie prenante externe : vous consultez les seules informations qui vous sont destinées, sans action sur le registre."
          : undefined
      }
    >
      {children}
    </CadreModule>
  )
}

/* ═══════════════════════════════ Formats ════════════════════════════════ */

/** Horodatage → « 01/10/2026 13:24 » à Libreville. */
export function dateHeureComplete(instant: number | null | undefined) {
  return instant ? `${dateCourte(instant)} ${heure(instant)}` : "—"
}

/* ═══════════════════════════════ Pastilles ══════════════════════════════ */

const TONS_GRAVITE: Record<Gravite, Ton> = {
  mineur: "neutral",
  significatif: "info",
  grave: "warning",
  majeur: "danger",
}

export function TagGravite({ gravite }: { gravite: Gravite }) {
  return (
    <Statut
      valeur={gravite}
      libelles={GRAVITES}
      tons={TONS_GRAVITE}
      icone={
        gravite === "majeur" || gravite === "grave" ? TriangleAlert : undefined
      }
    />
  )
}

export function TagEvenement({ statut }: { statut: StatutEvenement }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_EVENEMENT}
      tons={{
        declare: "warning",
        qualifie: "info",
        en_enquete: "accent",
        cloture: "success",
        classe: "neutral",
      }}
      icone={
        statut === "cloture"
          ? CircleCheck
          : statut === "classe"
            ? CircleX
            : statut === "declare"
              ? Clock
              : CircleDashed
      }
    />
  )
}

export function TagEnquete({ statut }: { statut: StatutEnquete }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_ENQUETE}
      tons={{
        ouverte: "info",
        instruction: "accent",
        rapport_soumis: "warning",
        cloturee: "success",
      }}
      icone={
        statut === "cloturee"
          ? CircleCheck
          : statut === "rapport_soumis"
            ? FileText
            : CircleDashed
      }
    />
  )
}

export function TagAction({ statut }: { statut: StatutAction }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_ACTION}
      tons={{
        planifiee: "neutral",
        en_cours: "info",
        realisee: "warning",
        verifiee: "success",
        annulee: "neutral",
      }}
      icone={
        statut === "verifiee"
          ? CircleCheck
          : statut === "annulee"
            ? CircleX
            : statut === "realisee"
              ? Clock
              : CircleDashed
      }
    />
  )
}

export function TagInspection({ statut }: { statut: StatutInspection }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_INSPECTION}
      tons={{ programmee: "info", realisee: "success", annulee: "neutral" }}
      icone={
        statut === "realisee"
          ? CircleCheck
          : statut === "annulee"
            ? CircleX
            : Clock
      }
    />
  )
}

export function TagResultat({ resultat }: { resultat: ResultatInspection }) {
  return (
    <Statut
      valeur={resultat}
      libelles={RESULTATS_INSPECTION}
      tons={{
        conforme: "success",
        conforme_reserves: "warning",
        non_conforme: "danger",
      }}
      icone={
        resultat === "conforme"
          ? CircleCheck
          : resultat === "non_conforme"
            ? CircleX
            : TriangleAlert
      }
    />
  )
}

export function TagGraviteNc({ gravite }: { gravite: GraviteNc }) {
  return (
    <Statut
      valeur={gravite}
      libelles={GRAVITES_NC}
      tons={{ mineure: "neutral", majeure: "warning", critique: "danger" }}
    />
  )
}

export function TagArtf({ statut }: { statut: StatutArtf }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_ARTF}
      tons={{
        a_preparer: "warning",
        prete: "info",
        transmise: "accent",
        accusee: "success",
      }}
      icone={
        statut === "accusee"
          ? CircleCheck
          : statut === "transmise"
            ? Send
            : statut === "prete"
              ? FileText
              : Clock
      }
    />
  )
}

/** Mention écrite d'un retard : le mot, pas seulement la teinte. */
export function TagRetard({ libelle = "En retard" }: { libelle?: string }) {
  return (
    <Tag tone="danger">
      <TriangleAlert aria-hidden />
      {libelle}
    </Tag>
  )
}

/* ═══════════════════════════════ Graphiques ═════════════════════════════ */

/** Barre d'avancement d'une action : la barre et le pourcentage écrit. */
export function Avancement({ valeur }: { valeur: number }) {
  const part = Math.max(0, Math.min(100, valeur))
  return (
    <span className="flex min-w-[120px] items-center gap-2">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={part}
        aria-label="Avancement"
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunk"
      >
        <span
          className="block h-full rounded-pill bg-accent-base"
          style={{ width: `${part}%` }}
        />
      </span>
      <b className="tabular w-11 text-right text-[13px]">{part} %</b>
    </span>
  )
}

/**
 * Répartition en barres horizontales : libellé, barre, chiffre écrit, et le
 * même contenu en tableau dans un `<details>` pour les lecteurs d'écran.
 */
export function Barres({
  libelle,
  lignes,
}: {
  libelle: string
  lignes: readonly { cle: string; libelle: string; valeur: number }[]
}) {
  const total = lignes.reduce((t, l) => t + l.valeur, 0)
  const max = Math.max(1, ...lignes.map((l) => l.valeur))
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label={libelle}>
        {lignes.map((ligne) => (
          <li
            key={ligne.cle}
            className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-x-3 gap-y-1 text-[13.5px] sm:grid-cols-[190px_minmax(0,1fr)_48px]"
          >
            <span className="min-w-0 truncate font-semibold">
              {ligne.libelle}
            </span>
            <span
              aria-hidden
              className="order-last col-span-2 h-2.5 overflow-hidden rounded-pill bg-surface-sunk sm:order-none sm:col-span-1"
            >
              <span
                className="block h-full rounded-pill bg-accent-base"
                style={{ width: `${(ligne.valeur / max) * 100}%` }}
              />
            </span>
            <b className="tabular text-right">{nombre(ligne.valeur)}</b>
          </li>
        ))}
      </ul>
      <details className="text-small text-ink-muted">
        <summary className="min-h-11 cursor-pointer py-2">
          Voir le tableau : {libelle.toLowerCase()}
        </summary>
        <TableSimple
          libelle={libelle}
          colonnes={[
            { libelle: "Catégorie" },
            { libelle: "Événements", numerique: true },
            { libelle: "Part", numerique: true },
          ]}
          lignes={lignes.map((l) => [
            l.libelle,
            nombre(l.valeur),
            total > 0 ? `${Math.round((l.valeur / total) * 100)} %` : "—",
          ])}
          pied={["Total", nombre(total), total > 0 ? "100 %" : "—"]}
        />
      </details>
    </div>
  )
}
