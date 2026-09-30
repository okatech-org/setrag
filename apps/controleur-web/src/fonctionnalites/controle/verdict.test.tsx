import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EmbarkedManifest, EmbarkedTicket, Verdict as VerdictLocal } from "@/lib/offline/types"
import { LIBELLE_SUITE, LIBELLE_VERDICT, suitesDuVerdict } from "@/lib/verdicts"

import type { ResultatControle } from "./controle"
import { RETOUR_AUTO_MS, Verdict } from "./verdict"

const mocks = vi.hoisted(() => ({
  enregistrer: vi.fn(async () => undefined),
  push: vi.fn(),
  retour: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))
vi.mock("./controle", () => ({ useControle: () => ({ enregistrer: mocks.enregistrer, inspecter: vi.fn() }) }))
vi.mock("@/lib/retour", () => ({ retourDuVerdict: mocks.retour }))

const MANIFESTE: EmbarkedManifest = {
  tripId: "t",
  trainNumber: "TR-201",
  trainType: "EXPRESS",
  serviceDate: "2026-10-01",
  departureAt: Date.parse("2026-10-01T07:00:00Z"),
  originName: "Owendo Virié",
  destinationName: "Franceville",
  segmentCount: 2,
  stops: [
    { sequence: 0, stationId: "s0", code: "OWE", name: "Owendo Virié", kilometerPoint: 0 },
    { sequence: 1, stationId: "s1", code: "BOO", name: "Booué", kilometerPoint: 340 },
    { sequence: 2, stationId: "s2", code: "FCV", name: "Franceville", kilometerPoint: 648 },
  ],
  fare: null,
  penalties: [],
  signing: { publicKey: "00", keyVersion: 1, isDemoKey: false },
  ticketCount: 1,
  downloadedCount: 1,
  cursor: null,
  complete: true,
  updatedAt: Date.now(),
}

vi.mock("../terminal/contexte-terminal", () => ({
  useTerminal: () => ({ manifest: MANIFESTE, settings: { currentStopIndex: 1, coachLabel: "V4" } }),
}))

const TITRE: EmbarkedTicket = {
  _id: "k1",
  number: "B-OWE-PV-20261001-000004",
  passenger: { lastName: "NZE", firstName: "Antoinette", gender: "F" },
  serviceClass: "DEUXIEME",
  seatLabel: "2B",
  coachLabel: "V4",
  fromStopIndex: 0,
  toStopIndex: 2,
  status: "valide",
}

function resultat(verdict: VerdictLocal): ResultatControle {
  const lu = verdict !== "illisible" && verdict !== "contrefait"
  return {
    verdict,
    reason: verdict === "valide" ? null : "motif",
    payload: lu
      ? { v: 1, k: 1, kind: "billet", ref: TITRE.number, trip: "t", date: "2026-10-01", cls: "DEUXIEME", from: 0, to: 2, exp: 0 }
      : null,
    ticket: lu && verdict !== "inconnu" ? TITRE : undefined,
    fromManifest: false,
    code: "SETRAG1:…",
    manuel: false,
  }
}

const VERDICTS = Object.keys(LIBELLE_VERDICT) as VerdictLocal[]

describe("Écran de verdict", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(VERDICTS)("%s : le mot en tête, un seul bouton primaire", (verdict) => {
    render(<Verdict resultat={resultat(verdict)} onFermer={mocks.retour} />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(LIBELLE_VERDICT[verdict])
    const primaires = screen
      .getAllByRole("button")
      .filter((bouton) => bouton.className.includes("bg-accent-base"))
    expect(primaires).toHaveLength(1)
    expect(primaires[0]!.textContent).toBe(LIBELLE_SUITE[suitesDuVerdict(verdict).principale])
  })

  it("revient seul au viseur 1,5 s après un titre valide, en enregistrant le contrôle", async () => {
    const onFermer = vi.fn()
    render(<Verdict resultat={resultat("valide")} onFermer={onFermer} />)
    await act(async () => {
      vi.advanceTimersByTime(RETOUR_AUTO_MS + 10)
    })
    expect(mocks.enregistrer).toHaveBeenCalledOnce()
    expect(onFermer).toHaveBeenCalledOnce()
  })

  it("reste à l'écran quand l'agent touche l'écran", async () => {
    const onFermer = vi.fn()
    render(<Verdict resultat={resultat("valide")} onFermer={onFermer} />)
    fireEvent.pointerDown(screen.getByRole("heading", { level: 1 }))
    await act(async () => {
      vi.advanceTimersByTime(RETOUR_AUTO_MS * 2)
    })
    expect(onFermer).not.toHaveBeenCalled()
    expect(screen.getByText("Retour automatique annulé.")).toBeTruthy()
  })

  it("n'enregistre rien pour un code illisible : on représente le code", async () => {
    const onFermer = vi.fn()
    render(<Verdict resultat={resultat("illisible")} onFermer={onFermer} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scanner à nouveau" }))
    })
    expect(mocks.enregistrer).not.toHaveBeenCalled()
    expect(onFermer).toHaveBeenCalledOnce()
  })
})
