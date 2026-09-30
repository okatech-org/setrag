import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TerminalProvider, useTerminal } from "./contexte-terminal"

const mocks = vi.hoisted(() => {
  const empty = () => ({
    total: 0,
    failed: 0,
    criticalPending: 0,
    byKind: {
      incident: { pending: 0, failed: 0, sent: 0 },
      penalty: { pending: 0, failed: 0, sent: 0 },
      sale: { pending: 0, failed: 0, sent: 0 },
      scan: { pending: 0, failed: 0, sent: 0 },
    },
  })
  return {
    empty,
    online: true,
    authenticated: true,
    summary: empty(),
    mutation: vi.fn(async () => ({
      created: 1,
      duplicates: 0,
      conflicts: 0,
      numbers: [],
    })),
    synchronize: vi.fn(async () => ({
      sent: 1,
      failed: 0,
      conflicts: 0,
      errors: [],
    })),
  }
})

vi.mock("@/hooks/use-online", () => ({
  useOnline: () => mocks.online,
}))

vi.mock("@workspace/api/hooks", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
  useMutation: () => mocks.mutation,
}))

vi.mock("@workspace/backend/generated", () => ({
  api: {
    functions: {
      control: {
        syncScans: "syncScans",
        syncSale: "syncSale",
        syncPenalties: "syncPenalties",
        syncIncidents: "syncIncidents",
        incidentPhotoUploadUrl: "incidentPhotoUploadUrl",
      },
    },
  },
}))

vi.mock("@/lib/offline/db", () => ({
  getManifest: vi.fn(async () => undefined),
  getSettings: vi.fn(async () => ({
    coachLabel: "1",
    currentStopIndex: 0,
    torch: false,
    deviceId: "TEST",
  })),
  queueSummary: vi.fn(async () => mocks.summary),
  saveSettings: vi.fn(async (patch: Record<string, unknown>) => ({
    coachLabel: "1",
    currentStopIndex: 0,
    torch: false,
    deviceId: "TEST",
    ...patch,
  })),
}))

vi.mock("@/lib/offline/sync", () => ({
  synchronize: mocks.synchronize,
}))

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function Harness() {
  const { ready, queue, refresh } = useTerminal()
  return (
    <>
      <span>{ready ? `prêt-${queue.total}` : "chargement"}</span>
      <button type="button" onClick={() => void refresh()}>
        Relire la file
      </button>
    </>
  )
}

describe("synchronisation automatique du terminal", () => {
  beforeEach(() => {
    mocks.online = true
    mocks.authenticated = true
    mocks.summary = mocks.empty()
    mocks.synchronize.mockReset()
    mocks.synchronize.mockImplementation(async () => {
      mocks.summary = mocks.empty()
      return { sent: 1, failed: 0, conflicts: 0, errors: [] }
    })
  })

  it("envoie une nouvelle écriture sans action manuelle quand le terminal est déjà en ligne", async () => {
    render(
      <TerminalProvider>
        <Harness />
      </TerminalProvider>
    )
    await screen.findByText("prêt-0")

    mocks.summary = {
      ...mocks.empty(),
      total: 1,
      byKind: {
        ...mocks.empty().byKind,
        scan: { pending: 1, failed: 0, sent: 0 },
      },
    }
    fireEvent.click(screen.getByRole("button", { name: "Relire la file" }))

    await screen.findByText("prêt-1")
    await waitFor(() => expect(mocks.synchronize).toHaveBeenCalledOnce(), {
      timeout: 2_500,
    })
    await screen.findByText("prêt-0")
  })
})
