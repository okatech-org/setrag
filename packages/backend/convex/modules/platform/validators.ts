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
  v.literal("admin_it"),
  v.literal("direction_generale"),
  v.literal("audit_risques"),
  v.literal("juriste"),
  v.literal("regulateur_cotraf"),
  v.literal("conducteur_ligne"),
  v.literal("visiteur_rames"),
  v.literal("responsable_atelier"),
  v.literal("magasinier"),
  v.literal("agent_voie"),
  v.literal("responsable_prn"),
  v.literal("technicien_signalisation"),
  v.literal("gestionnaire_fret"),
  v.literal("fiscaliste_tresorier"),
  v.literal("gestionnaire_paie"),
  v.literal("planificateur_roulements"),
  v.literal("medecin_travail"),
  v.literal("inspecteur_securite"),
  v.literal("chef_train"),
  v.literal("ingenieur_atelier"),
  v.literal("contremaitre_atelier"),
  v.literal("gestionnaire_stocks"),
  v.literal("cantonnier"),
  v.literal("agent_ouvrages_ponts"),
  v.literal("technicien_telecoms"),
  v.literal("chef_vente"),
  v.literal("gestionnaire_litiges_fret"),
  v.literal("comptable_auxiliaire"),
  v.literal("fiscaliste"),
  v.literal("tresorier"),
  v.literal("infirmier_travail"),
  v.literal("enqueteur_accidents"),
  v.literal("responsable_environnement"),
  v.literal("representant_comilog"),
  v.literal("representant_meridiam"),
  v.literal("representant_etat"),
  v.literal("auditeur_artf"),
  v.literal("controleur_eaux_forets"),
  v.literal("agent_douanes"),
  v.literal("operateur_gsez"),
  v.literal("agent_dgi"),
  v.literal("organisme_social"),
  v.literal("bailleur_fonds")
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

/** Les trois niveaux métier exposés par le contrôle d'accès modulaire. */
export const moduleAccessLevelValidator = v.union(
  v.literal("lecture"),
  v.literal("utilisation"),
  v.literal("admin")
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
