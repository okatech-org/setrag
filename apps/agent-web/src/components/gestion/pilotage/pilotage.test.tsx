import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { getFunctionName } from "convex/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const etat = vi.hoisted(() => ({
  role: "controleur_recettes",
  params: new URLSearchParams(),
  donnees: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/gestion",
  useRouter: () => ({ push: vi.fn(), replace: etat.replace }),
  useSearchParams: () => etat.params,
}))
vi.mock("@/components/portal-guard", () => ({
  usePortalSession: () => ({
    profile: { user: { _id: "u1", role: etat.role, firstName: "Awa", lastName: "Ndong", matricule: "CR-01" } },
    signingOut: false,
    signOut: vi.fn(),
  }),
}))
vi.mock("@/components/seller-shell", () => ({
  SellerShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: (ref: never, args: unknown) => (args === "skip" ? undefined : etat.donnees[getFunctionName(ref)]),
  useMutation: (ref: never) => {
    const nom = getFunctionName(ref)
    etat.mutations[nom] ??= vi.fn().mockResolvedValue({})
    return etat.mutations[nom]
  },
}))
vi.mock("convex/react", async (original) => ({
  ...(await original<typeof import("convex/react")>()),
  useConvex: () => ({ query: vi.fn() }),
}))

import { estimerPosition } from "./circulation"
import { peutAgir } from "./droits"
import { ecart, montantCompact, variation } from "./format"
import { Comptabilite } from "./comptabilite"
import { Integrations } from "./integrations"
import { differences, erreursParametres, ParametragePage, type Parametres } from "./parametrage"
import { ControleRecettes } from "./recettes"
import { bornesPeriode, TableauDeBord } from "./tableau-de-bord"

// jsdom ne connaît pas ResizeObserver, qu’utilise le contrôle segmenté.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const MIN = 60_000
const JOUR = "2026-10-01"

beforeEach(() => {
  etat.role = "controleur_recettes"
  etat.params = new URLSearchParams()
  etat.donnees = {}
  etat.mutations = {}
})

/* ═════════════════════════════ Règles pures ═════════════════════════════ */

describe("règles du pilotage", () => {
  it("estime la position d’un train entre deux gares, retard compris", () => {
    const depart = Date.parse("2026-10-01T06:40:00Z")
    const train = {
      status: "retarde" as const,
      delayMinutes: 20,
      departureAt: depart,
      arrivalAt: depart + 600 * MIN,
      stops: [
        { km: 0, name: "Owendo", departureAt: depart },
        { km: 182, name: "Ndjolé", arrivalAt: depart + 180 * MIN, departureAt: depart + 185 * MIN },
        { km: 648, name: "Franceville", arrivalAt: depart + 600 * MIN },
      ],
    }
    expect(estimerPosition(train, depart + 10 * MIN)).toEqual({ etat: "avant-depart" })
    const enRoute = estimerPosition(train, depart + 110 * MIN)
    expect(enRoute).toMatchObject({ etat: "en-route", sens: "aller", entre: ["Owendo", "Ndjolé"] })
    expect(enRoute.etat === "en-route" && Math.round(enRoute.km)).toBe(91)
    expect(estimerPosition(train, depart + 202 * MIN)).toMatchObject({ etat: "en-route", km: 182, entre: null })
    expect(estimerPosition({ ...train, status: "annule" }, depart)).toEqual({ etat: "supprime" })
    expect(estimerPosition(train, depart + 700 * MIN)).toEqual({ etat: "arrive" })
  })

  it("borne les périodes du tableau de bord", () => {
    expect(bornesPeriode("7j", JOUR)).toMatchObject({ from: "2026-09-25", to: JOUR })
    expect(bornesPeriode("30j", JOUR)).toMatchObject({ from: "2026-09-02", to: JOUR })
    expect(bornesPeriode("annee", JOUR)).toMatchObject({ from: "2026-01-01", to: JOUR })
  })

  it("écrit les écarts et les variations sans les laisser à la couleur", () => {
    expect(ecart(-500)).toBe("−500")
    expect(ecart(1250)).toBe("+1\u202f250")
    expect(ecart(0)).toBe("0")
    expect(variation(null)).toBe("sans référence")
    expect(variation(6.2)).toBe("+6,2 %")
    expect(montantCompact(184_600_000)).toEqual({ chiffre: "184,6", unite: "M XAF" })
  })

  it("applique les droits comme le serveur : habilitation directe en plafond", () => {
    expect(peutAgir("controleur_recettes", [], "caisse", "valider")).toBe(true)
    expect(peutAgir("chef_gare", [], "caisse", "valider")).toBe(false)
    const lecture = [{ code: "voyageurs", accessLevel: "lecture" as const, accessSource: "grant" }]
    expect(peutAgir("controleur_recettes", lecture, "caisse", "valider")).toBe(false)
    expect(peutAgir("controleur_recettes", lecture, "caisse", "consulter")).toBe(true)
    // L’administration système garde la main sur la technique, jamais sur le métier.
    expect(peutAgir("admin_it", [], "integrations", "modifier")).toBe(true)
    expect(peutAgir("admin_it", [], "journal_comptable", "consulter")).toBe(true)
    expect(peutAgir("admin_it", [], "rapports", "creer")).toBe(false)
  })
})

/* ═════════════════════════ Contrôle des recettes ════════════════════════ */

const journee = {
  _id: "day1",
  date: JOUR,
  status: "ouverte",
  totalTtc: 654_000,
  totalReceived: 654_000,
  closedAt: undefined,
  closedBy: null,
  exportStatus: undefined,
  caisses: 2,
  ouvertes: 0,
  aViser: 1,
  aJustifier: 0,
  ecartNet: -500,
  ecartBrut: 500,
}

function caisseFixture(id: string, ecartXaf: number) {
  return {
    _id: id,
    pointOfSale: { code: "OWE", name: "Gare d’Owendo" },
    seller: `Vendeur ${id}`,
    sellerMatricule: "V-101",
    openedAt: Date.parse("2026-10-01T06:00:00Z"),
    closedAt: Date.parse("2026-10-01T12:24:00Z"),
    openingFloatXaf: 50_000,
    operations: 12,
    refunds: 1,
    expectedXaf: 432_750,
    countedXaf: 432_750 + ecartXaf,
    varianceXaf: ecartXaf,
    varianceReason: ecartXaf ? "Pièce rendue en trop" : null,
    etat: ecartXaf ? "a_viser" : "juste",
    validatedBy: null,
    validatedAt: null,
    recountRequestedAt: null,
  }
}

describe("contrôle des recettes", () => {
  beforeEach(() => {
    etat.donnees["functions/pilotage:journeesRecettes"] = [journee]
    etat.donnees["functions/pilotage:caissesJournee"] = {
      day: { _id: "day1", date: JOUR, status: "ouverte", closedAt: null, exportStatus: null },
      caisses: [caisseFixture("s1", -500), caisseFixture("s2", 0)],
      totals: { netTtc: 654_000, ventes: 24, ventesTtc: 682_000, remboursements: 1, remboursementsTtc: 28_000, horsCaisseTtc: 0, horsCaisse: 0 },
    }
    etat.donnees["functions/pilotage:caisse"] = {
      session: {
        _id: "s1",
        status: "cloturee",
        etat: "a_viser",
        openedAt: Date.parse("2026-10-01T06:00:00Z"),
        closedAt: Date.parse("2026-10-01T12:24:00Z"),
        openingFloatXaf: 50_000,
        expectedXaf: 432_750,
        countedXaf: 432_250,
        varianceXaf: -500,
        varianceReason: "Pièce de 500 XAF rendue en trop",
        validatedBy: null,
        validatedAt: null,
        visaComment: null,
        recountRequestedAt: null,
        recountRequestedBy: null,
        recountReason: null,
      },
      seller: "N. Moussavou · V-101",
      pointOfSale: { code: "OWE", name: "Gare d’Owendo" },
      day: { _id: "day1", date: JOUR, status: "ouverte" },
      billetage: [{ method: "especes", expectedXaf: 432_750, countedXaf: 432_250, varianceXaf: -500 }],
      operations: [],
      journal: [],
    }
  })

  it("liste les caisses, ouvre le dossier et vise l’écart", async () => {
    etat.params = new URLSearchParams("caisse=s1")
    render(<ControleRecettes />)
    expect(screen.getByRole("heading", { level: 1, name: "Contrôle des recettes" })).toBeInTheDocument()
    const tableau = screen.getByRole("table", { name: /Caisses de la journée/ })
    expect(within(tableau).getAllByText("À viser").length).toBeGreaterThan(0)
    expect(screen.getByText("Manque en caisse")).toBeInTheDocument()
    expect(screen.getByText("« Pièce de 500 XAF rendue en trop »")).toBeInTheDocument()

    const viser = screen.getByRole("button", { name: /Viser l’écart/ })
    fireEvent.click(viser)
    expect(etat.mutations["functions/pilotage:viserCaisse"]).toHaveBeenCalledWith({ sessionId: "s1", commentaire: undefined })
    expect(await screen.findByText(/Écart visé/)).toBeInTheDocument()
  })

  it("passe en consultation seule pour un chef de gare", () => {
    etat.role = "chef_gare"
    etat.params = new URLSearchParams("caisse=s1")
    render(<ControleRecettes />)
    expect(screen.queryByRole("button", { name: /Viser/ })).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════ Comptabilité ═══════════════════════════ */

describe("comptabilité", () => {
  it("montre les pièces rejetées par SAGE et propose de les corriger", () => {
    etat.role = "comptable"
    const rejet = {
      pieceNumber: "VEN-0412",
      pointOfSaleCode: "AG-POG",
      analyticAccount: "706100",
      costCenter: undefined,
      ttc: 32_500,
      reason: "Compte analytique inconnu : CC-AG-POG (point de vente suspendu)",
    }
    etat.donnees["functions/pilotage:journeesComptables"] = [
      {
        _id: "d29",
        date: "2026-09-29",
        status: "cloturee",
        totalTtc: 32_500,
        exportStatus: "echec",
        exportError: "SAGE X3 : 1 pièce rejetée",
        journal: { pieces: 1, totalTtc: 32_500, refundsTtc: 0, generatedAt: 1 },
        event: { _id: "e1", status: "echec", attempts: 1, lastError: "SAGE X3 : 1 pièce rejetée", sentAt: null },
        derniereTransmission: { sentAt: 2, result: "rejete", receiptNumber: "X3-20260929-01", rejected: 1 },
      },
    ]
    etat.donnees["functions/pilotage:detailJournee"] = {
      day: { _id: "d29", date: "2026-09-29", status: "cloturee", totalTtc: 32_500, closedAt: 1, exportStatus: "echec", exportError: "x" },
      entries: [
        { _id: "j1", journalCode: "VT", pieceNumber: "VEN-0412", saleDate: "2026-09-29", financialSite: "SETRAG", pointOfSaleCode: "AG-POG", analyticAccount: "706100", costCenter: null, ht: 27_542, vat: 4_958, css: 0, ttc: 32_500 },
      ],
      totaux: { ht: 27_542, vat: 4_958, css: 0, ttc: 32_500, ventesTtc: 32_500, sortiesTtc: 0 },
      equilibre: { debit: 32_500, credit: 32_500, ecart: 0, attendu: 32_500, ecartJournee: 0 },
      byAccount: [{ analyticAccount: "706100", count: 1, ht: 27_542, ttc: 32_500 }],
      event: { _id: "e1", status: "echec", attempts: 1, lastError: "x", createdAt: 1, sentAt: null },
      transmissions: [
        { _id: "t1", attempt: 1, sentAt: 2, result: "rejete", receiptNumber: "X3-20260929-01", pieceCount: 1, totalTtc: 32_500, rejectedPieces: [rejet], simulated: true, sentBy: "Comptable" },
      ],
      caisses: { total: 1, ouvertes: 0, nonVisees: 0 },
      centresDeCout: [{ code: "CC-LBV", label: "LBV · Agence Libreville" }],
    }
    render(<Comptabilite />)
    expect(screen.getByText(/point de vente suspendu/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Corriger et rejouer le 29\/09/ })).toBeDisabled()
    expect(screen.getByText("Journal équilibré, conforme à la recette")).toBeInTheDocument()
    expect(screen.getByText(/ses réponses sont simulées/)).toBeInTheDocument()
  })
})

/* ═══════════════════════════════ Intégrations ═══════════════════════════ */

describe("intégrations", () => {
  it("dit l’état de chaque service par la forme et le texte", () => {
    etat.role = "admin_it"
    etat.donnees["functions/pilotage:etatIntegrations"] = {
      verifieLe: 1,
      services: [
        { code: "SAGE_X3", nom: "SAGE X3 V12", usage: "Déversement comptable V65", etat: "incident", libelleEtat: "1 déversement rejeté", dernierEchange: null, fileAttente: 0, echecs: 1, reussite30j: 50, simule: true, evenements: [], dernierTest: null },
        { code: "ENTRA_ID", nom: "Entra ID", usage: "Connexion unique", etat: "non_raccorde", libelleEtat: "Non raccordé · contrat de données attendu", dernierEchange: null, fileAttente: null, echecs: 0, reussite30j: null, simule: true, evenements: [], dernierTest: null },
      ],
    }
    render(<Integrations />)
    expect(screen.getByText("1 déversement rejeté")).toBeInTheDocument()
    expect(screen.getByText("Non raccordé · contrat de données attendu")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Relancer les échecs \(1\)/ })).toBeInTheDocument()
  })
})

/* ═══════════════════════════════ Paramétrage ════════════════════════════ */

const PARAMETRES: Parametres = {
  vatPct: 18,
  cssPct: 0,
  seatHoldMinutes: 15,
  mobilePaymentAttempts: 3,
  degradedSalesEnabled: true,
  cashVarianceNotificationsEnabled: true,
  saleOpeningDays: 90,
  refundPenaltyEarlyPct: 10,
  refundPenaltyLatePct: 25,
  refundThresholdHours: 2,
  refundAfterDepartureAllowed: false,
  refundReasons: ["Changement de programme"],
  ssoEnabled: true,
  mfaRequired: true,
  otpFallbackEnabled: true,
  sessionIdleMinutes: 10,
  ticketPrintFormat: "thermique_80",
  duplicateMention: "DUPLICATA",
  ticketFooter: "Billet nominatif.",
}

describe("paramétrage", () => {
  it("contrôle les valeurs et liste les différences", () => {
    expect(erreursParametres(PARAMETRES)).toEqual({})
    expect(erreursParametres({ ...PARAMETRES, refundPenaltyLatePct: 5 }).refundPenaltyLatePct).toMatch(/inférieure/)
    expect(differences(PARAMETRES, { ...PARAMETRES, seatHoldMinutes: 10 })).toEqual(["seatHoldMinutes"])
  })

  it("montre la barre des modifications non enregistrées puis enregistre", () => {
    etat.role = "admin_fonctionnel"
    etat.donnees["functions/pilotage:parametres"] = { courant: PARAMETRES, misAJourLe: null, misAJourPar: null, programme: null, historique: [] }
    render(<ParametragePage />)
    const tenue = screen.getByLabelText(/Tenue d’une place/)
    fireEvent.change(tenue, { target: { value: "10" } })
    expect(screen.getByText("1 modification non enregistrée")).toBeInTheDocument()
    expect(screen.getByText(/Tenue d’une place : 15 min → 10 min/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }))
    expect(etat.mutations["functions/management:saveSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ seatHoldMinutes: 10, effectiveFrom: undefined })
    )
  })
})

/* ═════════════════════════════ Tableau de bord ══════════════════════════ */

describe("tableau de bord", () => {
  it("dit quand la période n’a aucune journée clôturée et propose la dernière", () => {
    etat.role = "responsable_kpi"
    etat.donnees["functions/reporting:dashboard"] = {
      period: { from: "2026-09-02", to: JOUR, days: 30 },
      comparedTo: { from: "2026-08-03", to: "2026-09-01" },
      revenue: { grossTtc: 0, refundedTtc: 0, netTtc: 0, variation: { current: 0, previous: 0, delta: 0, pct: null } },
      volume: { sales: 0, tickets: 0, variation: { current: 0, previous: 0, delta: 0, pct: null } },
      quality: { refundRatePct: 0, cancelledCount: 0, refundedCount: 0, averageBasketTtc: 0 },
      occupancy: { seatKmOffered: 0, seatKmSold: 0, pct: 0, tripCount: 0 },
      hasData: false,
    }
    etat.donnees["functions/pilotage:periodeDisponible"] = { premiere: "2026-06-01", derniere: "2026-07-25", aujourdhui: JOUR }
    etat.donnees["functions/pilotage:aDecider"] = [
      { cle: "ecarts", genre: "ecart", ton: "veille", titre: "3 écarts de caisse à viser", detail: "OWE, BOO", lien: "/gestion/recettes" },
    ]
    render(<TableauDeBord />)
    expect(screen.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeInTheDocument()
    expect(screen.getByText(/Aucune journée clôturée sur la période/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Afficher jusqu’au/ })).toBeInTheDocument()
    expect(screen.getByText("3 écarts de caisse à viser")).toBeInTheDocument()
    expect(screen.getByRole("radiogroup", { name: "Période" })).toBeInTheDocument()
  })
})
