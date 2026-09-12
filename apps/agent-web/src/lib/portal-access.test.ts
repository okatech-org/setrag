import { describe, expect, it } from "vitest"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import {
  APP_ROLES,
  can,
  isInternalRole,
  type AppRole,
} from "@workspace/backend/permissions"

import {
  ENTERPRISE_DESTINATIONS,
  EXECUTIVE_PATH,
  MANAGEMENT_DESTINATIONS,
  MODULE_ADMINISTRATION_PATH,
  SELLER_ROLES,
  STAFF_WIDE_PATHS,
  canAccessManagementPath,
  canAccessSalePath,
  defaultManagementPath,
  portalForRole,
} from "./portal-access"

describe("accès aux portails par profil", () => {
  it("classe exhaustivement les profils", () => {
    const expected: Record<AppRole, "vente" | "gestion" | null> = {
      voyageur: null,
      vendeur_guichet: "vente",
      vendeur_agence: "vente",
      taxateur: "vente",
      controleur_train: "gestion",
      controleur_recettes: "gestion",
      chef_gare: "gestion",
      comptable: "gestion",
      responsable_kpi: "gestion",
      admin_fonctionnel: "gestion",
      admin_it: "gestion",
      direction_generale: "gestion",
      audit_risques: "gestion",
      juriste: "gestion",
      regulateur_cotraf: "gestion",
      conducteur_ligne: "gestion",
      visiteur_rames: "gestion",
      responsable_atelier: "gestion",
      magasinier: "gestion",
      agent_voie: "gestion",
      responsable_prn: "gestion",
      technicien_signalisation: "gestion",
      gestionnaire_fret: "gestion",
      fiscaliste_tresorier: "gestion",
      gestionnaire_paie: "gestion",
      planificateur_roulements: "gestion",
      medecin_travail: "gestion",
      inspecteur_securite: "gestion",
      chef_train: "gestion",
      ingenieur_atelier: "gestion",
      contremaitre_atelier: "gestion",
      gestionnaire_stocks: "gestion",
      cantonnier: "gestion",
      agent_ouvrages_ponts: "gestion",
      technicien_telecoms: "gestion",
      chef_vente: "gestion",
      gestionnaire_litiges_fret: "gestion",
      comptable_auxiliaire: "gestion",
      fiscaliste: "gestion",
      tresorier: "gestion",
      infirmier_travail: "gestion",
      enqueteur_accidents: "gestion",
      responsable_environnement: "gestion",
      representant_comilog: "gestion",
      representant_meridiam: "gestion",
      representant_etat: "gestion",
      auditeur_artf: "gestion",
      controleur_eaux_forets: "gestion",
      agent_douanes: "gestion",
      operateur_gsez: "gestion",
      agent_dgi: "gestion",
      organisme_social: "gestion",
      bailleur_fonds: "gestion",
    }

    for (const role of APP_ROLES) {
      expect(portalForRole(role), role).toBe(expected[role])
    }
  })

  it("n’autorise aucun profil de gestion dans les routes de vente", () => {
    for (const role of APP_ROLES.filter(
      (candidate) =>
        candidate !== "voyageur" && !SELLER_ROLES.includes(candidate)
    )) {
      expect(canAccessSalePath(role, "/vente"), role).toBe(false)
      expect(canAccessSalePath(role, "/vente/caisse"), role).toBe(false)
    }
  })

  it("applique les restrictions métier dans le portail de vente", () => {
    expect(canAccessSalePath("vendeur_guichet", "/vente/caisse")).toBe(true)
    expect(
      canAccessSalePath("vendeur_guichet", "/vente/ventes-manuelles")
    ).toBe(true)
    expect(canAccessSalePath("vendeur_agence", "/vente/ventes-manuelles")).toBe(
      false
    )
    expect(canAccessSalePath("taxateur", "/vente/caisse")).toBe(false)
    expect(canAccessSalePath("taxateur", "/vente/ventes-manuelles")).toBe(true)
  })

  it("aligne chaque écran de gestion sur la matrice Convex", () => {
    for (const role of APP_ROLES) {
      for (const destination of MANAGEMENT_DESTINATIONS) {
        expect(
          canAccessManagementPath(role, destination.href),
          `${role} → ${destination.href}`
        ).toBe(can(role, destination.resource, "consulter"))
      }
    }
  })

  it("adosse chaque module officiel du manifeste à la matrice Convex", () => {
    for (const role of APP_ROLES) {
      for (const destination of MODULE_MANIFEST.filter(
        ({ route }) => route !== "/gestion"
      )) {
        expect(
          canAccessManagementPath(role, destination.route),
          `${role} → ${destination.route}`
        ).toBe(can(role, destination.resource, "consulter"))
      }
    }
  })

  it("utilise la ressource Fret dédiée", () => {
    const freight = MODULE_MANIFEST.find(({ code }) => code === "fret")

    expect(freight?.resource).toBe("fret")
    expect(
      ENTERPRISE_DESTINATIONS.find(({ href }) => href === "/fret")?.resource
    ).toBe("fret")
  })

  it("réserve les modules transverses au personnel interne", () => {
    for (const href of STAFF_WIDE_PATHS) {
      expect(canAccessManagementPath("voyageur", href), href).toBe(false)
      for (const role of APP_ROLES.filter(
        (candidate) => candidate !== "voyageur"
      )) {
        expect(canAccessManagementPath(role, href), `${role} → ${href}`).toBe(
          isInternalRole(role)
        )
      }
    }
  })

  it("laisse la garde modulaire filtrer l’espace d’administration", () => {
    expect(
      canAccessManagementPath("admin_it", MODULE_ADMINISTRATION_PATH)
    ).toBe(true)
    expect(
      canAccessManagementPath("direction_generale", MODULE_ADMINISTRATION_PATH)
    ).toBe(true)
    expect(
      canAccessManagementPath("representant_etat", MODULE_ADMINISTRATION_PATH)
    ).toBe(false)
    expect(
      canAccessManagementPath("voyageur", MODULE_ADMINISTRATION_PATH)
    ).toBe(false)
  })

  it("réserve l’espace Direction générale au seul rôle exécutif", () => {
    expect(canAccessManagementPath("direction_generale", EXECUTIVE_PATH)).toBe(
      true
    )
    expect(
      canAccessManagementPath(
        "direction_generale",
        `${EXECUTIVE_PATH}/finances`
      )
    ).toBe(true)
    for (const role of [
      "chef_vente",
      "admin_it",
      "audit_risques",
      "representant_etat",
      "voyageur",
    ] as const) {
      expect(canAccessManagementPath(role, EXECUTIVE_PATH), role).toBe(false)
      expect(
        canAccessManagementPath(role, `${EXECUTIVE_PATH}/risques`),
        role
      ).toBe(false)
    }
  })

  it("n’ouvre aucun module d’entreprise à un chemin inconnu", () => {
    for (const role of APP_ROLES) {
      expect(canAccessManagementPath(role, "/module-inconnu"), role).toBe(false)
      expect(
        canAccessManagementPath(role, "/module-inconnu/detail"),
        role
      ).toBe(false)
    }
  })

  it("donne à chaque profil de gestion un accueil réellement autorisé", () => {
    for (const role of APP_ROLES.filter(
      (candidate) => portalForRole(candidate) === "gestion"
    )) {
      const destination = defaultManagementPath(role)
      expect(destination, role).not.toBe("/connexion")
      expect(canAccessManagementPath(role, destination), role).toBe(true)
    }
  })

  it("oriente les acteurs vers leur espace métier primaire", () => {
    const expectedPaths: Partial<Record<AppRole, string>> = {
      admin_it: "/administration",
      direction_generale: "/direction",
      audit_risques: "/securite",
      juriste: "/bureautique",
      regulateur_cotraf: "/cotraf",
      conducteur_ligne: "/cotraf",
      visiteur_rames: "/materiel",
      responsable_atelier: "/materiel",
      magasinier: "/materiel",
      agent_voie: "/infrastructures",
      responsable_prn: "/infrastructures",
      technicien_signalisation: "/infrastructures",
      gestionnaire_fret: "/fret",
      fiscaliste_tresorier: "/finances",
      gestionnaire_paie: "/rh",
      planificateur_roulements: "/rh",
      medecin_travail: "/rh",
      inspecteur_securite: "/securite",
      chef_train: "/securite",
      ingenieur_atelier: "/materiel",
      contremaitre_atelier: "/materiel",
      gestionnaire_stocks: "/materiel",
      cantonnier: "/infrastructures",
      agent_ouvrages_ponts: "/infrastructures",
      technicien_telecoms: "/infrastructures",
      chef_vente: "/gestion",
      gestionnaire_litiges_fret: "/fret",
      comptable_auxiliaire: "/finances",
      fiscaliste: "/finances",
      tresorier: "/finances",
      infirmier_travail: "/rh",
      enqueteur_accidents: "/securite",
      responsable_environnement: "/securite",
      representant_comilog: "/fret",
      representant_meridiam: "/infrastructures",
      representant_etat: "/gestion",
      auditeur_artf: "/securite",
      controleur_eaux_forets: "/fret",
      agent_douanes: "/fret",
      operateur_gsez: "/fret",
      agent_dgi: "/finances",
      organisme_social: "/rh",
      bailleur_fonds: "/infrastructures",
    }

    for (const [role, path] of Object.entries(expectedPaths)) {
      expect(defaultManagementPath(role as AppRole), role).toBe(path)
      expect(canAccessManagementPath(role as AppRole, path), role).toBe(true)
    }
  })
})
