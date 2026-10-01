"use client"

import { Check, Lock, Minus, ShieldCheck } from "lucide-react"
import { useMemo, useState } from "react"

import {
  APP_ROLES,
  EXTERNAL_STAKEHOLDER_ROLES,
  MODULE_RESOURCES,
  PERMISSIONS,
  PROTECTED_RESOURCES,
  permissionsFor,
  type AppRole,
  type Permission,
  type ProtectedResource,
} from "@workspace/backend/permissions"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

import { Panneau, suffixeDate, telechargerCsv } from "@/components/charte"
import { ROLE_LABELS } from "@/lib/roles"

import { SelectFiltre } from "./elements"

/** Ressources protégées, dites en métier. La matrice vient de `model/permissions.ts`. */
export const LIBELLES_RESSOURCES: Record<ProtectedResource, string> = {
  ventes: "Vendre, encaisser",
  annulations: "Annuler une vente",
  remboursements: "Rembourser",
  duplicatas: "Duplicatas de billets",
  ventes_manuelles: "Ressaisir une vente papier",
  caisse: "Caisse",
  journee_comptable: "Journée comptable",
  journal_comptable: "Journal comptable (SAGE)",
  referentiel: "Référentiel : trains, gares, points de vente",
  livrets_horaires: "Livrets horaires",
  tarifs: "Grilles tarifaires",
  yield: "Yield management",
  places: "Places et blocages",
  quotas_agences: "Quotas des agences",
  donnees_voyageurs: "Données voyageurs",
  controles: "Contrôles à bord",
  proces_verbaux: "Procès-verbaux",
  incidents: "Incidents",
  utilisateurs: "Utilisateurs et droits",
  parametrage: "Paramétrage",
  integrations: "Intégrations",
  rapports: "Rapports",
  voyageurs: "Module Billetterie et voyageurs",
  fret: "Module Fret",
  cotraf: "Module Régulation (COTRAF)",
  gmao: "Module Matériel (GMAO)",
  infrastructure: "Module Infrastructures",
  finance: "Module Finances",
  rh: "Module Ressources humaines",
  ged: "Module Bureautique et GED",
  securite: "Module Sécurité",
  copilot: "Module Copilot",
}

export const LIBELLES_DROITS: Record<Permission, { court: string; long: string }> = {
  consulter: { court: "Lire", long: "consulter" },
  creer: { court: "Créer", long: "créer" },
  modifier: { court: "Modif.", long: "modifier" },
  supprimer: { court: "Suppr.", long: "supprimer" },
  valider: { court: "Valid.", long: "valider" },
}

const MODULES = new Set<string>(MODULE_RESOURCES)
export const RESSOURCES_METIER = PROTECTED_RESOURCES.filter((r) => !MODULES.has(r))
export const ROLES_INTERNES = APP_ROLES.filter(
  (role) => role !== "voyageur" && !(EXTERNAL_STAKEHOLDER_ROLES as readonly string[]).includes(role)
)

const ROLES_PAR_DEFAUT: AppRole[] = ["vendeur_guichet", "chef_gare", "controleur_recettes", "admin_fonctionnel", "admin_it"]

/** Une cellule : tout, rien, ou les droits accordés en toutes lettres. */
export function CelluleDroits({ droits }: { droits: readonly Permission[] }) {
  if (droits.length === PERMISSIONS.length) {
    return (
      <span className="inline-flex items-center gap-1 text-success-ink" title="Tous les droits">
        <Check aria-hidden className="size-[18px]" />
        <span className="text-[12px] font-semibold">Tous</span>
      </span>
    )
  }
  if (droits.length === 0) {
    return (
      <span className="inline-flex items-center text-ink-faint" title="Aucun droit">
        <Minus aria-hidden className="size-[18px]" />
        <span className="sr-only">Aucun droit</span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-1.5 text-[12px] font-semibold text-accent-ink" title={droits.map((d) => LIBELLES_DROITS[d].long).join(", ")}>
      {droits.map((d) => (
        <span key={d}>{LIBELLES_DROITS[d].court}</span>
      ))}
    </span>
  )
}

/** Rôles qui détiennent un droit : sert aux invariants affichés sous la matrice. */
export function rolesAvecDroit(resource: ProtectedResource, permission: Permission) {
  return APP_ROLES.filter((role) => permissionsFor(role, resource).includes(permission))
}

export function MatriceDroits({ rolesInitiaux = ROLES_PAR_DEFAUT }: { rolesInitiaux?: readonly AppRole[] }) {
  const [roles, setRoles] = useState<AppRole[]>([...rolesInitiaux])
  const [portee, setPortee] = useState<"metier" | "modules">("metier")
  const ressources = portee === "metier" ? RESSOURCES_METIER : MODULE_RESOURCES
  const ajoutables = useMemo(() => ROLES_INTERNES.filter((r) => !roles.includes(r)), [roles])
  const modifierControle = rolesAvecDroit("controles", "modifier")

  const exporter = () =>
    telechargerCsv(
      `matrice-droits-${suffixeDate()}`,
      [
        { libelle: "Ressource", valeur: (r: ProtectedResource) => LIBELLES_RESSOURCES[r] },
        ...APP_ROLES.map((role) => ({
          libelle: ROLE_LABELS[role],
          valeur: (r: ProtectedResource) => permissionsFor(role, r).map((d) => LIBELLES_DROITS[d].long).join(", ") || "—",
        })),
      ],
      PROTECTED_RESOURCES
    )

  return (
    <Panneau
      plein
      titre="Matrice des droits"
      icone={ShieldCheck}
      sousTitre="consulter · créer · modifier · supprimer · valider, par rôle"
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={exporter}>
          Exporter la matrice complète
        </Button>
      }
      pied={
        <span className="grid gap-1">
          <span className="inline-flex items-center gap-1.5">
            <Lock aria-hidden className="size-4 shrink-0" />
            « Modifier un contrôle à bord » est accordé à {modifierControle.length === 0 ? "aucun rôle" : modifierControle.map((r) => ROLE_LABELS[r]).join(", ")} : un contrôle enregistré ne se modifie jamais.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock aria-hidden className="size-4 shrink-0" />
            « Valider une grille tarifaire » : jamais la sienne. Le serveur refuse qu’un administrateur approuve une grille qu’il a rédigée ou soumise.
          </span>
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <SelectFiltre libelle="Ressources affichées" value={portee} onChange={(v) => setPortee(v as typeof portee)}>
          <option value="metier">Droits fins de la billetterie</option>
          <option value="modules">Accès aux modules</option>
        </SelectFiltre>
        <SelectFiltre
          libelle="Ajouter un rôle à comparer"
          value=""
          onChange={(role) => role && setRoles((liste) => [...liste, role as AppRole].slice(-8))}
          className="min-w-[220px]"
        >
          <option value="">Ajouter un rôle…</option>
          {ajoutables.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectFiltre>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((role) => (
            <Tag key={role} tone="filterOn" onRemove={roles.length > 1 ? () => setRoles((l) => l.filter((r) => r !== role)) : undefined} removeLabel={`Retirer ${ROLE_LABELS[role]}`}>
              {ROLE_LABELS[role].split(" — ")[0]}
            </Tag>
          ))}
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-[14px]" aria-label="Matrice des droits par rôle">
          <thead>
            <tr className="bg-surface-sunk text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
              <th scope="col" className="sticky left-0 bg-surface-sunk px-3.5 py-2.5 text-left">Ressource</th>
              {roles.map((role) => (
                <th key={role} scope="col" className="min-w-[110px] px-3 py-2.5 text-center normal-case tracking-normal">
                  {ROLE_LABELS[role].split(" — ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ressources.map((ressource) => (
              <tr key={ressource} className="border-t border-line">
                <th scope="row" className="sticky left-0 bg-surface px-3.5 py-2 text-left font-semibold">
                  {LIBELLES_RESSOURCES[ressource]}
                </th>
                {roles.map((role) => (
                  <td key={role} className="px-3 py-2 text-center">
                    <CelluleDroits droits={permissionsFor(role, ressource)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panneau>
  )
}
