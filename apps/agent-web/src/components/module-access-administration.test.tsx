import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { setAccessLevels } = vi.hoisted(() => ({
  setAccessLevels: vi.fn().mockResolvedValue({ updated: 1, grantIds: [] }),
}))

vi.mock("@workspace/api/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/api/hooks")>()
  return { ...original, useMutation: () => setAccessLevels }
})

import {
  MAX_MODULE_ACCESS_BATCH_SIZE,
  ModuleAccessMatrix,
  canAddPendingModuleChange,
  filterAdministrationUsers,
  moduleAccessCellKey,
} from "./module-access-administration"

describe("matrice d’administration modulaire", () => {
  it("recherche par identité, matricule et libellé de rôle", () => {
    const users = [
      {
        email: "direction@setrag.ga",
        firstName: "Démo",
        lastName: "Direction",
        matricule: "DG-001",
        role: "direction_generale" as const,
      },
      {
        email: "fret@setrag.ga",
        firstName: "Aline",
        lastName: "Mba",
        matricule: "FR-002",
        role: "gestionnaire_fret" as const,
      },
    ]

    expect(filterAdministrationUsers(users, "generale")).toEqual([users[0]])
    expect(filterAdministrationUsers(users, "fr-002")).toEqual([users[1]])
    expect(filterAdministrationUsers(users, "inconnu")).toEqual([])
  })

  it("fabrique une clé stable par utilisateur et module", () => {
    expect(moduleAccessCellKey("user-42", "finance")).toBe("user-42:finance")
  })

  it("borne chaque lot à 100 nouvelles modifications", () => {
    expect(canAddPendingModuleChange(99, false)).toBe(true)
    expect(canAddPendingModuleChange(MAX_MODULE_ACCESS_BATCH_SIZE, false)).toBe(
      false
    )
    expect(canAddPendingModuleChange(MAX_MODULE_ACCESS_BATCH_SIZE, true)).toBe(
      true
    )
  })

  it("présente un état vide explicite quand aucun utilisateur ne correspond", () => {
    render(
      <ModuleAccessMatrix
        data={
          {
            modules: [],
            users: [],
            cells: [],
          } as Parameters<typeof ModuleAccessMatrix>[0]["data"]
        }
      />
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucun utilisateur trouvé"
    )
    expect(
      screen.getByRole("button", { name: "Enregistrer (0)" })
    ).toBeDisabled()
  })

  it("enregistre les changements dans un seul lot atomique", async () => {
    setAccessLevels.mockClear()
    render(
      <ModuleAccessMatrix
        data={
          {
            modules: [
              {
                code: "fret",
                label: "Fret",
                route: "/fret",
                resource: "fret",
                defaultEnabled: true,
              },
            ],
            users: [
              {
                userId: "user-fret",
                email: "agent.fret@setrag.ga",
                firstName: "Aline",
                lastName: "Mba",
                matricule: "FR-002",
                role: "gestionnaire_fret",
                isActive: true,
              },
            ],
            cells: [
              {
                userId: "user-fret",
                moduleCode: "fret",
                accessLevel: "lecture",
                accessSource: "role",
                enabled: true,
                canAccess: true,
                hasDirectGrant: false,
                directAccessLevel: null,
              },
            ],
          } as Parameters<typeof ModuleAccessMatrix>[0]["data"]
        }
      />
    )

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Attribution de Fret pour Aline Mba",
      }),
      { target: { value: "utilisation" } }
    )
    fireEvent.change(screen.getByLabelText("Motif du changement"), {
      target: { value: "Ticket DSI-42" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer (1)" }))

    await waitFor(() =>
      expect(setAccessLevels).toHaveBeenCalledWith({
        changes: [
          {
            userId: "user-fret",
            moduleCode: "fret",
            accessLevel: "utilisation",
          },
        ],
        reason: "Ticket DSI-42",
      })
    )
    expect(setAccessLevels).toHaveBeenCalledTimes(1)
  })

  it("verrouille les cellules de l’Admin système", () => {
    render(
      <ModuleAccessMatrix
        data={
          {
            modules: [
              {
                code: "fret",
                label: "Fret",
                route: "/fret",
                resource: "fret",
                defaultEnabled: true,
              },
            ],
            users: [
              {
                userId: "user-dsi",
                email: "dsi@setrag.ga",
                firstName: "Démo",
                lastName: "DSI",
                matricule: "DSI-001",
                role: "admin_it",
                isActive: true,
              },
            ],
            cells: [
              {
                userId: "user-dsi",
                moduleCode: "fret",
                accessLevel: "admin",
                accessSource: "system",
                enabled: true,
                canAccess: true,
                hasDirectGrant: false,
                directAccessLevel: null,
              },
            ],
          } as Parameters<typeof ModuleAccessMatrix>[0]["data"]
        }
      />
    )

    expect(screen.getByText("Admin système")).toBeInTheDocument()
    expect(
      screen.getByText("Accès de gouvernance non modifiable.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", {
        name: "Attribution de Fret pour Démo DSI",
      })
    ).not.toBeInTheDocument()
  })
})
