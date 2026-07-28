import { describe, expect, it } from "vitest"

import { APP_ROLES, can, type AppRole } from "@workspace/backend/permissions"

import {
  MANAGEMENT_DESTINATIONS,
  SELLER_ROLES,
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
