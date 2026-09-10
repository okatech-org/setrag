import { describe, expect, it } from "vitest"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import { APP_ROLES, can, type AppRole } from "@workspace/backend/permissions"

import {
  ENTERPRISE_DESTINATIONS,
  MANAGEMENT_DESTINATIONS,
  SELLER_ROLES,
  STAFF_WIDE_PATHS,
  canAccessManagementPath,
  canAccessSalePath,
  defaultManagementPath,
  portalForRole,
} from "./portal-access"

describe("accès aux portails par profil", () => {
  it("classe exhaustivement les onze profils", () => {
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
          true
        )
      }
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
})
