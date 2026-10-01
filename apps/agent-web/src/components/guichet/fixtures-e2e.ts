import { getFunctionName, type FunctionReference } from "convex/server"

/**
 * Jeux de données des parcours Playwright (`NEXT_PUBLIC_E2E_MODE=1`), sans
 * backend. Fixes et cohérents entre eux : une caisse ouverte à Owendo, un
 * Express 201 demain vers Franceville, deux opérations du jour.
 */

const MAINTENANT = Date.parse("2026-10-01T13:18:00+01:00")
const DEMAIN = "2026-10-02"
const DEPART = Date.parse(`${DEMAIN}T07:40:00+01:00`)
const ARRIVEE = Date.parse(`${DEMAIN}T19:25:00+01:00`)

const GARES = [
  { _id: "gare-owe", code: "OWE", name: "Owendo", kilometerPoint: 0 },
  { _id: "gare-ndj", code: "NDJ", name: "Ndjolé", kilometerPoint: 175 },
  { _id: "gare-boo", code: "BOO", name: "Booué", kilometerPoint: 340 },
  { _id: "gare-moa", code: "MOA", name: "Moanda", kilometerPoint: 612 },
  { _id: "gare-fcv", code: "FCV", name: "Franceville", kilometerPoint: 648 },
]

const CONTEXTE = {
  seller: { id: "vendeur-e2e", firstName: "Nadège", lastName: "MOUSSAVOU", matricule: "V-101", role: "vendeur_guichet" },
  pointOfSale: {
    id: "pdv-owe",
    code: "OWE-PV",
    name: "Gare d'Owendo · guichet 2",
    type: "gare",
    isActive: true,
    stationId: "gare-owe",
    stationCode: "OWE",
    stationName: "Owendo",
  },
  session: {
    id: "caisse-e2e",
    openedAt: Date.parse("2026-10-01T06:30:00+01:00"),
    openingFloatXaf: 50_000,
    emergencyBooklet: { number: "0042", firstNumber: "004201", lastNumber: "004250" },
  },
  parametres: {
    tenueMinutes: 15,
    tentativesMobile: 3,
    ventesDegradees: true,
    mentionDuplicata: "DUPLICATA",
    piedBillet: "Billet nominatif, valable sur ce train uniquement.",
  },
}

const OPERATIONS = [
  {
    id: "vente-4820",
    numero: "V-OWE-PV-20261001-004820",
    kind: "vente",
    produit: "billet",
    canal: "guichet",
    statut: "confirmee",
    etat: "emis",
    montant: 48_000,
    percu: 48_000,
    moyen: "airtel_money",
    heure: Date.parse("2026-10-01T13:02:00+01:00"),
    client: "Paul ELLA NGUEMA",
    telephone: "+241 77 12 34 56",
    trajet: "Owendo → Franceville",
    desserte: { trainNumber: "TR-201", trainType: "EXPRESS", serviceDate: DEMAIN, departAt: DEPART },
    places: ["V2 · 7C"],
    references: ["B-OWE-PV-20261001-006001"],
    billets: 1,
    origine: null,
  },
  {
    id: "vente-4812",
    numero: "V-OWE-PV-20261001-004812",
    kind: "vente",
    produit: "billet",
    canal: "guichet",
    statut: "confirmee",
    etat: "controle",
    montant: 11_500,
    percu: 11_500,
    moyen: "moov_money",
    heure: Date.parse("2026-10-01T07:12:00+01:00"),
    client: "Hervé OBAME",
    telephone: null,
    trajet: "Owendo → Ndjolé",
    desserte: { trainNumber: "TR-201", trainType: "EXPRESS", serviceDate: "2026-10-01", departAt: DEPART - 86_400_000 },
    places: ["V3 · 2B"],
    references: ["B-OWE-PV-20261001-005990"],
    billets: 1,
    origine: null,
  },
]

function sieges() {
  const liste = []
  const voitures = [
    { id: "v4", label: "V4", position: 4, classe: "DEUXIEME", rangs: 8 },
    { id: "v5", label: "V5", position: 5, classe: "DEUXIEME", rangs: 8 },
    { id: "v2", label: "V2", position: 2, classe: "PREMIERE", rangs: 6 },
  ]
  for (const voiture of voitures) {
    for (let rang = 1; rang <= voiture.rangs; rang += 1) {
      for (let colonne = 1; colonne <= 4; colonne += 1) {
        const label = `${rang}${"ABCD"[colonne - 1]}`
        const occupee = voiture.id === "v4" && ["1A", "2B", "3C", "5D"].includes(label)
        const bloquee = voiture.id === "v4" && label === "8D"
        liste.push({
          seatId: `siege-${voiture.id}-${label}`,
          coachId: voiture.id,
          coachLabel: voiture.label,
          coachPosition: voiture.position,
          coachRowCount: voiture.rangs,
          coachColumnCount: 4,
          label,
          row: rang,
          column: colonne,
          serviceClass: voiture.classe,
          isBlocked: bloquee,
          isOccupied: occupee,
          isFree: !occupee && !bloquee,
        })
      }
    }
  }
  return liste.sort((a, b) => a.coachPosition - b.coachPosition || a.row - b.row || a.column - b.column)
}

function dossier(id: string) {
  const operation = OPERATIONS.find((o) => o.id === id) ?? { ...OPERATIONS[0]!, id, numero: "V-OWE-PV-20261001-004822", etat: "emis", moyen: "especes", montant: 32_500, percu: 32_500, client: "Aimée NZÉ", places: ["V4 · 12A"], references: ["B-OWE-PV-20261001-006002"] }
  const controle = operation.etat === "controle"
  return {
    resume: operation,
    vente: {
      id,
      numero: operation.numero,
      kind: "vente",
      produit: "billet",
      canal: "guichet",
      statut: "confirmee",
      montants: { ht: Math.round(operation.montant / 1.18), vat: operation.montant - Math.round(operation.montant / 1.18), css: 0, ttc: operation.montant, received: operation.montant },
      moyen: operation.moyen,
      heure: operation.heure,
      motif: null,
      penalitePct: null,
      vendeur: "Nadège MOUSSAVOU",
      matriculeVendeur: "V-101",
      pointDeVente: { code: "OWE-PV", name: "Gare d'Owendo · guichet 2" },
      telephone: "+241 77 12 34 56",
      finTenue: null,
    },
    desserte: { id: "desserte-201", trainNumber: "TR-201", trainType: "EXPRESS", serviceDate: DEMAIN, departAt: DEPART, arriveeAt: ARRIVEE, status: "planifie", delayMinutes: 0 },
    origine: { id: "gare-owe", code: "OWE", name: "Owendo" },
    arrivee: { id: "gare-fcv", code: "FCV", name: "Franceville" },
    billets: [
      {
        id: `${id}-billet-1`,
        numero: operation.references[0] ?? "B-OWE-PV-20261001-006002",
        voyageur: { nom: "NZÉ", prenom: "Aimée", telephone: "+241 77 12 34 56" },
        classe: "DEUXIEME",
        voiture: "V4",
        place: "12A",
        debout: false,
        prix: operation.montant,
        reduction: null,
        reductionPct: 0,
        statut: controle ? "utilise" : "valide",
        duplicatas: 0,
        codeBarres: "SETRAG1:E2E",
        controleA: controle ? DEPART - 86_400_000 + 12 * 60_000 : null,
      },
    ],
    paiements: [{ id: "paiement-1", moyen: operation.moyen, statut: "confirme", montant: operation.montant, remis: 50_000, rendu: 50_000 - operation.montant, reference: null, telephone: null, simule: false, regleA: operation.heure, raison: null }],
    liees: [],
    bagage: null,
    colis: null,
    transportSpecial: null,
    souche: null,
    chronologie: [
      { cle: "c1", heure: operation.heure, action: "vente.guichet", acteur: "Nadège MOUSSAVOU", detail: null },
      ...(controle ? [{ cle: "c2", heure: DEPART - 86_400_000 + 12 * 60_000, action: "controle.valide", acteur: "Contrôleur CT-07", detail: "TR-201 · en ligne" }] : []),
    ],
    actions: {
      duplicata: !controle,
      annulation: !controle,
      remboursement: false,
      controle,
      politique: { autorise: true, penalitePct: 10, raison: "Départ dans plus de 2 h" },
      motifs: ["Voyage annulé par le client", "Changement de date", "Erreur de vente au guichet"],
      baremeProvisoire: true,
    },
    moi: true,
    droits: { annuler: true, rembourser: false, dupliquer: true },
    caisseSortie: { mode: "agent", libelle: "Rendu de votre caisse" },
  }
}

const LECTURES: Record<string, (args: Record<string, unknown>) => unknown> = {
  "functions/guichet:contexte": () => CONTEXTE,
  "functions/cash:mySession": () => ({ session: { ...CONTEXTE.session, status: "ouverte" }, totalTtc: 59_500 }),
  "functions/guichet:accueil": () => ({
    station: { id: "gare-owe", code: "OWE", name: "Owendo" },
    caisse: { ouverteA: CONTEXTE.session.openedAt, fonds: 50_000 },
    indicateurs: { encaisse: 59_500, operations: 2, billets: 2, enfants: 0, especesAttendues: 50_000, sorties: 0, sortiesMontant: 0 },
    departs: [
      { tripId: "desserte-201", trainNumber: "TR-201", trainType: "EXPRESS", serviceDate: DEMAIN, departAt: DEPART, destination: "Franceville", status: "planifie", delayMinutes: 0, disponibles: { DEUXIEME: 86, PREMIERE: 24, VIP: 6 } },
    ],
    trafic: [],
    operations: OPERATIONS,
  }),
  "functions/referential:listStations": () => GARES,
  "functions/fareSchedules:publicDiscounts": () => [
    { code: "ENFANT", label: "Enfant de 4 à 11 ans", ratePct: 50, minAge: 4, maxAge: 11, minPassengers: null, maxPassengers: null, requiresProof: true },
    { code: "MILITAIRE", label: "Militaire avec ordre de mission", ratePct: 10, minAge: null, maxAge: null, minPassengers: null, maxPassengers: null, requiresProof: true },
  ],
  "functions/guichet:dessertes": (args) => {
    const codes = (args.discountCodes as string[] | undefined) ?? [""]
    const prix = (base: number) => codes.map((c) => (c === "ENFANT" ? base / 2 : c === "MILITAIRE" ? Math.round((base * 0.9) / 50) * 50 : base))
    const classe = (disponibles: number, capacite: number, base: number) => ({ disponibles, capacite, prixAdulteTtc: base, totalTtc: prix(base).reduce((s, p) => s + p, 0), lignes: prix(base) })
    return [
      {
        tripId: "desserte-201",
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate: DEMAIN,
        status: "planifie",
        delayMinutes: 0,
        departAt: DEPART,
        arriveeAt: ARRIVEE,
        fromIndex: 0,
        toIndex: 4,
        distanceKm: 648,
        arretsIntermediaires: 6,
        classes: { DEUXIEME: classe(86, 256, 32_500), PREMIERE: classe(24, 48, 48_000), VIP: classe(6, 24, 65_000) },
      },
    ]
  },
  "functions/trips:availableSeats": () => sieges(),
  "functions/guichet:vente": (args) => dossier(String(args.venteId)),
  "functions/guichet:perimetreApresVente": () => ({
    mode: "reseau",
    gare: null,
    pointsDeVente: [
      { id: "pdv-owe", code: "OWE-PV", name: "Gare d'Owendo · guichet 2", isActive: true },
      { id: "pdv-fcv", code: "FCV-PV", name: "Gare de Franceville", isActive: true },
    ],
    droits: { annuler: true, rembourser: true, dupliquer: true },
    parametres: CONTEXTE.parametres,
  }),
  "functions/guichet:operationsReseau": (args) =>
    (args.numero ? OPERATIONS.filter((o) => o.numero === args.numero || o.references.includes(String(args.numero))) : OPERATIONS).map((o) => ({
      ...o,
      pointDeVente: { id: "pdv-owe", code: "OWE-PV", name: "Gare d'Owendo · guichet 2" },
    })),
  "functions/guichet:operations": (args) => (args.numero ? OPERATIONS.filter((o) => o.numero === args.numero || o.references.includes(String(args.numero))) : OPERATIONS),
  "functions/guichet:clientsConventionnes": () => [{ id: "compte-comilog", code: "COMILOG", nom: "COMILOG · missions", plafond: 2_000_000, encours: 750_000, disponible: 1_250_000 }],
  "functions/guichet:caisse": () => ({
    id: "caisse-e2e",
    statut: "ouverte",
    ouverteA: CONTEXTE.session.openedAt,
    clotureeA: null,
    journee: "2026-10-01",
    fonds: 50_000,
    billetageOuverture: [{ denomination: 10_000, count: 3 }, { denomination: 5_000, count: 2 }, { denomination: 2_000, count: 4 }, { denomination: 1_000, count: 2 }],
    billetageCloture: null,
    carnet: CONTEXTE.session.emergencyBooklet,
    attendu: [
      { method: "especes", amountXaf: 0, count: 0 },
      { method: "airtel_money", amountXaf: 48_000, count: 1 },
      { method: "moov_money", amountXaf: 11_500, count: 1 },
    ],
    compte: null,
    ecart: null,
    justification: null,
    vendeur: "Nadège MOUSSAVOU",
    matricule: "V-101",
    pointDeVente: { code: "OWE-PV", name: "Gare d'Owendo · guichet 2" },
    encaissements: { nombre: 2, montant: 59_500 },
    sorties: { nombre: 0, montant: 0, numeros: [] },
    operations: [],
  }),
  "functions/guichet:sessionsCaisse": () => [
    { id: "caisse-veille", statut: "cloturee", journee: "2026-09-30", ouverteA: Date.parse("2026-09-30T06:30:00+01:00"), clotureeA: Date.parse("2026-09-30T18:02:00+01:00"), fonds: 50_000, operations: 23, attendu: 612_400, compte: 612_400, ecart: 0, justification: null },
  ],
  "functions/guichet:sessionCaisse": () => null,
  "functions/guichet:ventesManuelles": () => ({
    carnet: CONTEXTE.session.emergencyBooklet,
    sequence: { prefixe: "", premiere: 4201, derniere: 4250, largeur: 6, utilisees: 3, manquantes: ["004202"] },
    souches: [
      { id: "souche-1", venteId: "vente-4796", numero: "004201", numeroSysteme: "V-OWE-PV-20261001-004796", venduA: Date.parse("2026-10-01T09:18:00+01:00"), ressaisieA: MAINTENANT, voyageur: "MINTSA Grâce", trajet: "Owendo → Booué", classe: "DEUXIEME", desserte: null, montant: 23_000, billet: { numero: "B-OWE-PV-20261001-005980", voiture: "V4", place: "6A" }, vendeur: "Nadège MOUSSAVOU" },
      { id: "souche-3", venteId: "vente-4798", numero: "004203", numeroSysteme: "V-OWE-PV-20261001-004798", venduA: Date.parse("2026-10-01T09:31:00+01:00"), ressaisieA: MAINTENANT, voyageur: "OBAME Hervé", trajet: "Owendo → Ndjolé", classe: "DEUXIEME", desserte: null, montant: 7_500, billet: null, vendeur: "Nadège MOUSSAVOU" },
    ],
    indicateurs: { ressaisies: 2, encaisse: 30_500, coupure: { debut: Date.parse("2026-10-01T09:18:00+01:00"), fin: Date.parse("2026-10-01T09:31:00+01:00") } },
    vendeurId: "vendeur-e2e",
    caisseOuverte: true,
  }),
  "functions/guichet:billet": (args) =>
    String(args.reference).trim()
      ? {
          id: "billet-e2e",
          numero: String(args.reference).trim(),
          vente: "V-OWE-PV-20261001-004820",
          voyageur: "NZÉ Aimée",
          statut: "valide",
          classe: "DEUXIEME",
          voiture: "V4",
          place: "12A",
          origine: { code: "OWE", name: "Owendo" },
          arrivee: { code: "FCV", name: "Franceville" },
          distanceKm: 648,
          desserte: { trainNumber: "TR-201", trainType: "EXPRESS", serviceDate: DEMAIN, departAt: DEPART, status: "planifie" },
          bagages: [],
        }
      : null,
  "functions/ancillaries:quoteBaggage": () => ({ distanceKm: 648, breakdown: { registrationHt: 700, excessKg: 23.5, excessHt: 2_040, totalHt: 2_740 }, totalTtc: 3_233 }),
  "functions/ancillaries:quoteParcel": () => ({ distanceKm: 612, zone: 7, breakdown: { totalHt: 7_800, totalWeightKg: 18, items: [{ zone: 7, weightTier: 20, baseHt: 7_800, bulkFractions: 0, bulkHt: 0, totalHt: 7_800 }] }, totalTtc: 9_204 }),
  "functions/ancillaries:quoteSpecialTransport": () => ({ distanceKm: 648, breakdown: { zone: 7, ratePerTonneHt: 110_000, totalHt: 154_000 }, totalTtc: 181_720 }),
  "functions/guichet:paiement": () => null,
}

let compteur = 4822

const ECRITURES: Record<string, (args: Record<string, unknown>) => unknown> = {
  "functions/guichet:tenirPlaces": (args) => {
    const passagers = (args.passagers as { seatId?: string; discountCode?: string }[]) ?? []
    const prix = passagers.map((p) => (p.discountCode === "ENFANT" ? 16_250 : 32_500))
    const ttc = prix.reduce((s, p) => s + p, 0)
    return {
      venteId: "vente-e2e",
      numero: `V-OWE-PV-20261001-00${compteur}`,
      finTenue: Date.now() + 15 * 60_000,
      montants: { ht: Math.round(ttc / 1.18), vat: ttc - Math.round(ttc / 1.18), css: 0, ttc, received: 0 },
      billets: passagers.map((p, i) => ({ id: `billet-e2e-${i + 1}`, numero: `B-OWE-PV-20261001-00${6000 + i}`, seatId: p.seatId ?? null, voiture: p.seatId?.split("-")[1]?.toUpperCase() ?? "V4", place: p.seatId?.split("-")[2] ?? null, prix: prix[i]!, reduction: p.discountCode ?? null })),
    }
  },
  "functions/guichet:libererTenue": () => ({ liberes: 1 }),
  "functions/guichet:encaisserBillets": (args) => {
    compteur += 1
    return { statut: "confirmee", paiementId: null, venteId: "vente-e2e", expireA: null, monnaie: typeof args.tendered === "number" ? 0 : 0 }
  },
  "functions/guichet:annulerDemandePaiement": () => ({ statut: "echoue" }),
  "functions/guichet:demanderPaiement": () => ({ paiementId: "paiement-e2e", expireA: Date.now() + 180_000 }),
  "functions/guichet:rembourser": () => ({ refundId: "remb-e2e", number: "R-OWE-PV-20261001-000042", refundedTickets: 1, paidTtc: 32_500, penaltyPct: 10, refundedTtc: 29_250, partial: false, paymentMethod: "especes" }),
  "functions/sales:cancel": () => ({ cancellationId: "annul-e2e", number: "X-OWE-PV-20261001-000007", cancelledTickets: 1, amountTtc: -32_500, partial: false, paymentMethod: "especes" }),
  "functions/sales:reprintTicket": () => ({ ticketNumber: "B-OWE-PV-20261001-006002", duplicateCount: 1, mention: "DUPLICATA N°1" }),
  "functions/cash:openSession": () => "caisse-e2e",
  "functions/cash:closeSession": () => ({ varianceXaf: 0, expectedTotal: 59_500, countedTotal: 59_500, sessionId: "caisse-e2e" }),
  "functions/ancillaries:sellBaggage": () => ({ saleId: "vente-bagage", baggageId: "bagage-e2e", tagNumber: "G-OWE-PV-20261001-000041", distanceKm: 648, amounts: { ht: 2_740, vat: 493, css: 0, ttc: 3_233, received: 3_233 }, paymentMethod: "especes", changeXaf: 0 }),
  "functions/ancillaries:sellParcel": () => ({ saleId: "vente-colis", parcelId: "colis-e2e", shipmentNumber: "C-OWE-PV-20261001-002210", stickers: ["E-OWE-PV-20261001-003301"], distanceKm: 612, zone: 7, amounts: { ht: 7_800, vat: 1_404, css: 0, ttc: 9_204, received: 9_204 }, paymentMethod: "especes", changeXaf: 0 }),
  "functions/ancillaries:sellVehicleTransport": () => ({ saleId: "vente-taa", shipmentNumber: "A-OWE-PV-20261001-000003", amounts: { ht: 154_000, vat: 27_720, css: 0, ttc: 181_720, received: 181_720 }, paymentMethod: "especes", changeXaf: 0 }),
  "functions/ancillaries:sellFuneralTransport": () => ({ saleId: "vente-fun", shipmentNumber: "F-OWE-PV-20261001-000001", amounts: { ht: 154_000, vat: 27_720, css: 0, ttc: 181_720, received: 181_720 }, paymentMethod: "especes", changeXaf: 0 }),
  "functions/manualSales:recordManualSale": (args) => ({ saleId: "vente-souche", manualId: "souche-e2e", preprintedNumber: args.preprintedNumber, systemNumber: "V-OWE-PV-20261001-004830", amounts: {}, ticketNumber: "B-OWE-PV-20261001-006010", seat: { coachLabel: "V5", seatLabel: "3C" }, withoutSeat: false }),
}

export function fixtureLecture(reference: FunctionReference<"query">, args: unknown) {
  const fixture = LECTURES[getFunctionName(reference)]
  return fixture ? fixture((args ?? {}) as Record<string, unknown>) : undefined
}

export async function fixtureEcriture(reference: FunctionReference<"mutation">, args: unknown) {
  const fixture = ECRITURES[getFunctionName(reference)]
  return fixture ? fixture((args ?? {}) as Record<string, unknown>) : undefined
}
