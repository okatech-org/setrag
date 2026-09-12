import { describe, expect, it } from "vitest"
import {
  ADMIN_ROLES,
  APP_ROLES,
  EXTERNAL_STAKEHOLDER_ROLES,
  INTERNAL_ROLES,
  MODULE_RESOURCES,
  ONBOARD_ROLES,
  PERMISSIONS,
  PROTECTED_RESOURCES,
  accessibleResources,
  can,
  isInternalRole,
  permissionsFor,
  requiresMfa,
  type AppRole,
} from "./permissions"

describe("Cohérence de la matrice", () => {
  it("conserve les 11 rôles historiques et couvre les nouveaux acteurs", () => {
    expect(APP_ROLES.slice(0, 11)).toEqual([
      "voyageur",
      "vendeur_guichet",
      "vendeur_agence",
      "taxateur",
      "controleur_train",
      "controleur_recettes",
      "chef_gare",
      "comptable",
      "responsable_kpi",
      "admin_fonctionnel",
      "admin_it",
    ])
    expect(APP_ROLES).toHaveLength(53)
    expect(new Set(APP_ROLES).size).toBe(APP_ROLES.length)
  })

  it("expose les cinq droits exigés par le CDC §9.1.2", () => {
    expect([...PERMISSIONS]).toEqual([
      "consulter",
      "creer",
      "modifier",
      "supprimer",
      "valider",
    ])
  })

  it("ne déclare aucune ressource en double", () => {
    expect(new Set(PROTECTED_RESOURCES).size).toBe(PROTECTED_RESOURCES.length)
  })

  it("refuse par défaut : aucun rôle n'a tous les droits sur tout", () => {
    for (const role of APP_ROLES) {
      const complet = PROTECTED_RESOURCES.every((resource) =>
        PERMISSIONS.every((p) => can(role, resource, p))
      )
      expect(complet).toBe(false)
    }
  })

  it("chaque rôle interne dispose d'au moins une ressource", () => {
    for (const role of INTERNAL_ROLES) {
      expect(accessibleResources(role).length).toBeGreaterThan(0)
    }
  })

  it("un droit non déclaré vaut refus", () => {
    // Le vendeur guichet n'a aucun droit sur le paramétrage.
    for (const p of PERMISSIONS) {
      expect(can("vendeur_guichet", "parametrage", p)).toBe(false)
    }
    expect(permissionsFor("vendeur_guichet", "parametrage")).toEqual([])
  })
})

describe("Cloisonnement du rôle voyageur", () => {
  it("n'accède qu'à ses ventes et annulations", () => {
    expect(accessibleResources("voyageur")).toEqual(["ventes", "annulations"])
  })

  it("ne voit ni la caisse, ni la comptabilité, ni les autres voyageurs", () => {
    expect(can("voyageur", "caisse", "consulter")).toBe(false)
    expect(can("voyageur", "journal_comptable", "consulter")).toBe(false)
    expect(can("voyageur", "donnees_voyageurs", "consulter")).toBe(false)
    expect(can("voyageur", "rapports", "consulter")).toBe(false)
  })

  it("ne peut jamais valider quoi que ce soit", () => {
    for (const resource of PROTECTED_RESOURCES) {
      expect(can("voyageur", resource, "valider")).toBe(false)
    }
  })

  it("distingue le voyageur et les parties prenantes du personnel interne", () => {
    expect(isInternalRole("voyageur")).toBe(false)
    for (const role of INTERNAL_ROLES) {
      expect(isInternalRole(role)).toBe(true)
    }
    for (const role of EXTERNAL_STAKEHOLDER_ROLES) {
      expect(isInternalRole(role)).toBe(false)
    }
    expect(INTERNAL_ROLES).toHaveLength(42)
    expect(EXTERNAL_STAKEHOLDER_ROLES).toHaveLength(10)
  })
})

describe("Séparation des tâches — garde-fous anti-fraude", () => {
  it("un vendeur ne valide jamais sa propre caisse", () => {
    expect(can("vendeur_guichet", "caisse", "modifier")).toBe(true)
    expect(can("vendeur_guichet", "caisse", "valider")).toBe(false)
    expect(can("controleur_recettes", "caisse", "valider")).toBe(true)
  })

  it("un vendeur ne clôture pas la journée comptable", () => {
    expect(can("vendeur_guichet", "journee_comptable", "valider")).toBe(false)
    expect(can("controleur_recettes", "journee_comptable", "valider")).toBe(
      true
    )
    expect(can("comptable", "journee_comptable", "valider")).toBe(true)
  })

  it("un vendeur guichet ne rembourse pas seul", () => {
    expect(can("vendeur_guichet", "remboursements", "creer")).toBe(false)
    expect(can("vendeur_guichet", "remboursements", "consulter")).toBe(true)
    expect(can("chef_gare", "remboursements", "creer")).toBe(true)
    expect(can("controleur_recettes", "remboursements", "valider")).toBe(true)
  })

  it("aucun rôle ne peut supprimer une vente", () => {
    // Les annulations sont des écritures liées, jamais des suppressions.
    for (const role of APP_ROLES) {
      expect(can(role, "ventes", "supprimer")).toBe(false)
    }
  })

  it("aucun rôle ne modifie une vente après coup", () => {
    for (const role of APP_ROLES) {
      expect(can(role, "ventes", "modifier")).toBe(false)
    }
  })

  it("le journal comptable n'est jamais supprimable", () => {
    for (const role of APP_ROLES) {
      expect(can(role, "journal_comptable", "supprimer")).toBe(false)
    }
  })

  it("les contrôles à bord ne sont jamais modifiables ni supprimables", () => {
    for (const role of APP_ROLES) {
      expect(can(role, "controles", "modifier")).toBe(false)
      expect(can(role, "controles", "supprimer")).toBe(false)
    }
  })

  it("l'administrateur technique ne touche ni aux ventes ni aux tarifs", () => {
    expect(can("admin_it", "ventes", "consulter")).toBe(false)
    expect(can("admin_it", "ventes", "creer")).toBe(false)
    expect(can("admin_it", "tarifs", "modifier")).toBe(false)
    expect(can("admin_it", "yield", "modifier")).toBe(false)
    expect(can("admin_it", "caisse", "consulter")).toBe(false)
    expect(can("admin_it", "fret", "consulter")).toBe(true)
  })

  it("l'administrateur fonctionnel ne gère pas les intégrations techniques", () => {
    expect(can("admin_fonctionnel", "integrations", "consulter")).toBe(true)
    expect(can("admin_fonctionnel", "integrations", "modifier")).toBe(false)
    expect(can("admin_it", "integrations", "modifier")).toBe(true)
  })
})

describe("Droits opérationnels par métier", () => {
  it("cloisonne les données Fret selon la politique minimale", () => {
    expect(permissionsFor("responsable_kpi", "fret")).toEqual(["consulter"])
    expect(permissionsFor("chef_gare", "fret")).toEqual(["consulter"])
    expect(permissionsFor("admin_fonctionnel", "fret")).toEqual(PERMISSIONS)
    expect(permissionsFor("admin_it", "fret")).toEqual(["consulter"])
  })

  it("le vendeur guichet vend et encaisse", () => {
    expect(can("vendeur_guichet", "ventes", "creer")).toBe(true)
    expect(can("vendeur_guichet", "duplicatas", "creer")).toBe(true)
    expect(can("vendeur_guichet", "caisse", "creer")).toBe(true)
  })

  it("le vendeur d'agence ne crée pas d'annulation", () => {
    expect(can("vendeur_agence", "ventes", "creer")).toBe(true)
    expect(can("vendeur_agence", "annulations", "creer")).toBe(false)
    expect(can("vendeur_agence", "quotas_agences", "consulter")).toBe(true)
    expect(can("vendeur_agence", "quotas_agences", "modifier")).toBe(false)
  })

  it("le taxateur régularise les ventes manuelles", () => {
    expect(can("taxateur", "ventes_manuelles", "creer")).toBe(true)
    expect(can("taxateur", "ventes_manuelles", "modifier")).toBe(true)
    expect(can("taxateur", "caisse", "consulter")).toBe(false)
  })

  it("le vendeur guichet ressaisit ses billets papier sans pouvoir les modifier", () => {
    expect(can("vendeur_guichet", "ventes_manuelles", "consulter")).toBe(true)
    expect(can("vendeur_guichet", "ventes_manuelles", "creer")).toBe(true)
    expect(can("vendeur_guichet", "ventes_manuelles", "modifier")).toBe(false)
    expect(can("vendeur_guichet", "ventes_manuelles", "valider")).toBe(false)
  })

  it("le contrôleur de train contrôle, verbalise et vend à bord", () => {
    expect(can("controleur_train", "controles", "creer")).toBe(true)
    expect(can("controleur_train", "proces_verbaux", "creer")).toBe(true)
    expect(can("controleur_train", "incidents", "creer")).toBe(true)
    expect(can("controleur_train", "ventes", "creer")).toBe(true)
  })

  it("le contrôleur de train ne touche ni au paramétrage ni aux tarifs", () => {
    expect(can("controleur_train", "tarifs", "modifier")).toBe(false)
    expect(can("controleur_train", "parametrage", "consulter")).toBe(false)
    expect(can("controleur_train", "utilisateurs", "consulter")).toBe(false)
  })

  it("le chef de gare bloque et débloque des places", () => {
    expect(can("chef_gare", "places", "modifier")).toBe(true)
    expect(can("chef_gare", "places", "creer")).toBe(true)
    expect(can("vendeur_guichet", "places", "modifier")).toBe(false)
  })

  it("le responsable KPI exploite les rapports sans accéder à la caisse", () => {
    expect(can("responsable_kpi", "rapports", "creer")).toBe(true)
    expect(can("responsable_kpi", "rapports", "supprimer")).toBe(true)
    expect(can("responsable_kpi", "caisse", "consulter")).toBe(false)
    expect(can("responsable_kpi", "ventes", "creer")).toBe(false)
  })

  it("seul l'administrateur fonctionnel valide les tarifs et les livrets", () => {
    const valideurs = APP_ROLES.filter((r) => can(r, "tarifs", "valider"))
    expect(valideurs).toEqual(["admin_fonctionnel"])
    const valideursLivrets = APP_ROLES.filter((r) =>
      can(r, "livrets_horaires", "valider")
    )
    expect(valideursLivrets).toEqual(["admin_fonctionnel"])
  })

  it("seul l'administrateur technique crée des utilisateurs de toutes pièces", () => {
    expect(can("admin_it", "utilisateurs", "supprimer")).toBe(true)
    expect(can("admin_fonctionnel", "utilisateurs", "supprimer")).toBe(false)
    expect(can("admin_fonctionnel", "utilisateurs", "modifier")).toBe(true)
  })

  it("autorise l'écriture sur le module primaire et la lecture des secondaires", () => {
    expect(can("responsable_atelier", "gmao", "modifier")).toBe(true)
    expect(can("responsable_atelier", "finance", "consulter")).toBe(true)
    expect(can("responsable_atelier", "finance", "modifier")).toBe(false)

    expect(can("inspecteur_securite", "securite", "creer")).toBe(true)
    expect(can("inspecteur_securite", "infrastructure", "consulter")).toBe(true)
    expect(can("inspecteur_securite", "infrastructure", "modifier")).toBe(false)
  })

  it("habilite séparément chaque fonction interne nouvellement distinguée", () => {
    const primaryResources = [
      ["chef_train", "securite"],
      ["ingenieur_atelier", "gmao"],
      ["contremaitre_atelier", "gmao"],
      ["gestionnaire_stocks", "gmao"],
      ["cantonnier", "infrastructure"],
      ["agent_ouvrages_ponts", "infrastructure"],
      ["technicien_telecoms", "infrastructure"],
      ["chef_vente", "voyageurs"],
      ["gestionnaire_litiges_fret", "fret"],
      ["comptable_auxiliaire", "finance"],
      ["fiscaliste", "finance"],
      ["tresorier", "finance"],
      ["infirmier_travail", "rh"],
      ["enqueteur_accidents", "securite"],
      ["responsable_environnement", "securite"],
    ] as const

    for (const [role, resource] of primaryResources) {
      expect(isInternalRole(role)).toBe(true)
      expect(can(role, resource, "consulter")).toBe(true)
      expect(can(role, resource, "creer")).toBe(true)
      expect(can(role, resource, "modifier")).toBe(true)
    }
    expect(can("gestionnaire_stocks", "finance", "consulter")).toBe(true)
    expect(can("gestionnaire_stocks", "finance", "modifier")).toBe(false)
    expect(can("responsable_environnement", "fret", "consulter")).toBe(true)
    expect(can("responsable_environnement", "fret", "modifier")).toBe(false)
  })

  it("accorde la lecture des dix modules aux rôles transverses", () => {
    for (const resource of MODULE_RESOURCES) {
      expect(can("responsable_kpi", resource, "consulter")).toBe(true)
      expect(can("admin_it", resource, "consulter")).toBe(true)
      for (const permission of PERMISSIONS) {
        expect(can("admin_fonctionnel", resource, permission)).toBe(true)
      }
    }
  })

  it("limite la Direction générale à la consultation des rapports", () => {
    expect(permissionsFor("direction_generale", "rapports")).toEqual([
      "consulter",
    ])
    for (const permission of PERMISSIONS) {
      expect(can("direction_generale", "rapports", permission)).toBe(
        permission === "consulter"
      )
    }

    expect(permissionsFor("admin_it", "rapports")).toEqual(["consulter"])
    for (const role of EXTERNAL_STAKEHOLDER_ROLES) {
      expect(permissionsFor(role, "rapports")).toEqual([])
    }
  })

  it("maintient toutes les parties prenantes externes en lecture seule", () => {
    for (const role of EXTERNAL_STAKEHOLDER_ROLES) {
      expect(accessibleResources(role).length).toBeGreaterThan(0)
      for (const resource of PROTECTED_RESOURCES) {
        expect(
          permissionsFor(role, resource).every((p) => p === "consulter")
        ).toBe(true)
      }
    }
  })
})

describe("Accès aux données personnelles des voyageurs", () => {
  it("est limité aux rôles qui en ont un besoin opérationnel", () => {
    const habilites = APP_ROLES.filter((r) =>
      can(r, "donnees_voyageurs", "consulter")
    )
    expect(habilites.sort()).toEqual(
      [
        "vendeur_guichet",
        "taxateur",
        "controleur_train",
        "chef_train",
        "controleur_recettes",
        "chef_gare",
        "responsable_kpi",
        "admin_fonctionnel",
      ].sort()
    )
  })

  it("n'est jamais modifiable depuis le back-office", () => {
    for (const role of APP_ROLES) {
      expect(can(role, "donnees_voyageurs", "modifier")).toBe(false)
      expect(can(role, "donnees_voyageurs", "supprimer")).toBe(false)
    }
  })

  it("est fermé au vendeur d'agence et à l'administrateur technique", () => {
    expect(can("vendeur_agence", "donnees_voyageurs", "consulter")).toBe(false)
    expect(can("admin_it", "donnees_voyageurs", "consulter")).toBe(false)
    expect(can("comptable", "donnees_voyageurs", "consulter")).toBe(false)
  })
})

describe("Authentification forte", () => {
  it("est exigée de tout le personnel interne", () => {
    for (const role of INTERNAL_ROLES) {
      expect(requiresMfa(role)).toBe(true)
    }
  })

  it("ne s'applique pas au voyageur, authentifié par code à usage unique", () => {
    expect(requiresMfa("voyageur")).toBe(false)
  })

  it("reste exigée pour les comptes externes de démonstration", () => {
    for (const role of EXTERNAL_STAKEHOLDER_ROLES) {
      expect(requiresMfa(role)).toBe(true)
    }
  })

  it("liste les rôles habilités au contrôle à bord", () => {
    for (const role of ONBOARD_ROLES) {
      expect(can(role as AppRole, "controles", "consulter")).toBe(true)
    }
  })

  it("liste les rôles d'administration", () => {
    expect([...ADMIN_ROLES]).toEqual(["admin_fonctionnel", "admin_it"])
    for (const role of ADMIN_ROLES) {
      expect(can(role, "parametrage", "modifier")).toBe(true)
    }
  })
})
