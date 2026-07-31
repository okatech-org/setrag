import { APP_ROLES, can, type AppRole } from "@workspace/backend/permissions"

/**
 * Rôles habilités à contrôler à bord.
 *
 * La liste vient de la matrice de droits, pas d'une énumération recopiée :
 * un rôle qui perdrait le droit de créer un contrôle perdrait aussi l'accès à
 * l'application, sans qu'on ait à y penser.
 */
export function asAppRole(role: string | undefined): AppRole | undefined {
  return APP_ROLES.find((candidate) => candidate === role)
}

export function canControl(role: AppRole | undefined): boolean {
  return Boolean(role && can(role, "controles", "creer"))
}

export function canSellOnboard(role: AppRole | undefined): boolean {
  return Boolean(role && can(role, "ventes", "creer"))
}

export function canWritePenalty(role: AppRole | undefined): boolean {
  return Boolean(role && can(role, "proces_verbaux", "creer"))
}

/**
 * Arbitrer un conflit revient à clore un contrôle : c'est un acte de
 * supervision, réservé à qui peut modifier un procès-verbal. Le contrôleur,
 * lui, signale — voir `flagConflict`.
 */
export function canArbitrate(role: AppRole | undefined): boolean {
  return Boolean(role && can(role, "proces_verbaux", "modifier"))
}
