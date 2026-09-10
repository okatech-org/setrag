import type { AppRole } from "@workspace/backend/permissions"

export const ROLES = [
  ["voyageur", "Voyageur"],
  ["vendeur_guichet", "Vendeur guichet"],
  ["vendeur_agence", "Vendeur agence"],
  ["taxateur", "Taxateur"],
  ["controleur_train", "Contrôleur train"],
  ["controleur_recettes", "Contrôleur recettes"],
  ["chef_gare", "Chef de gare"],
  ["comptable", "Comptable"],
  ["responsable_kpi", "Responsable KPI"],
  ["admin_fonctionnel", "Administrateur fonctionnel"],
  ["admin_it", "Administrateur technique"],
] as const satisfies readonly (readonly [AppRole, string])[]

export const ROLE_LABELS = Object.fromEntries(ROLES) as Record<AppRole, string>
