import { v } from "convex/values"

/** Validateur compatible avec le rôle historique `users.role`. */
export const appRoleValidator = v.union(
  v.literal("voyageur"),
  v.literal("vendeur_guichet"),
  v.literal("vendeur_agence"),
  v.literal("taxateur"),
  v.literal("controleur_train"),
  v.literal("controleur_recettes"),
  v.literal("chef_gare"),
  v.literal("comptable"),
  v.literal("responsable_kpi"),
  v.literal("admin_fonctionnel"),
  v.literal("admin_it")
)

/** Validateur Convex réutilisable correspondant au catalogue pur. */
export const moduleCodeValidator = v.union(
  v.literal("voyageurs"),
  v.literal("fret"),
  v.literal("cotraf"),
  v.literal("gmao"),
  v.literal("infrastructure"),
  v.literal("finance"),
  v.literal("rh"),
  v.literal("ged"),
  v.literal("securite"),
  v.literal("copilot")
)

export const organizationTypeValidator = v.union(
  v.literal("entreprise"),
  v.literal("direction"),
  v.literal("partenaire")
)

export const siteTypeValidator = v.union(
  v.literal("site"),
  v.literal("gare"),
  v.literal("atelier")
)

export const platformEnvironmentValidator = v.union(
  v.literal("development"),
  v.literal("preview"),
  v.literal("staging"),
  v.literal("production"),
  v.literal("test")
)
