import { describe, expect, it } from "vitest"
import type { ReplayedToolExchange } from "./providers"
import {
  ACTEUR_INVITE,
  AGE_MAX_REJEU_MS,
  BUDGET_REJEU,
  SORTIE_REJEU_MAX,
  TOURS_REJOUES,
  TRAJETS_REJOUES_MAX,
  appelAEnregistrer,
  bornerJson,
  cleActeur,
  construireHistorique,
  reduirePourRejeu,
  type AppelEnregistre,
  type MessageHistorique,
  type TourHistorique,
} from "./rejeu"

const MAINTENANT = 1_800_000_000_000
const COMPTE = cleActeur({ userId: "user-ariane" })
const TOUS_LES_OUTILS = new Set([
  "list_stations",
  "search_trips",
  "get_trip",
  "quote_booking",
  "create_booking",
  "get_booking",
  "list_my_bookings",
  "list_my_tickets",
  "get_ticket_download_url",
  "get_my_profile",
])

function trajet(index: number) {
  return {
    tripId: `trip-${index}`,
    trainNumber: `${200 + index}`,
    trainType: "Express",
    serviceDate: "2026-10-01",
    status: "programme",
    cancelled: false,
    departureAt: 1_790_000_000_000 + index,
    arrivalAt: 1_790_000_600_000 + index,
    departureTime: "07:40",
    arrivalTime: "19:10",
    distanceKm: 669,
    intermediateStops: 21,
    availableByClass: { DEUXIEME: 40, PREMIERE: 12, VIP: 4 },
    prixParClasse: { DEUXIEME: { totalTtc: 34_500, unitaireTtc: 34_500 } },
    hasAvailability: true,
  }
}

function recherche(nombre: number) {
  return {
    originStationId: "station-owendo",
    destinationStationId: "station-franceville",
    serviceDate: "2026-10-01",
    passengers: 1,
    trips: Array.from({ length: nombre }, (_, index) => trajet(index)),
  }
}

function appel(
  callId: string,
  toolName: string,
  output: unknown,
  actorKey = COMPTE
): AppelEnregistre {
  return appelAEnregistrer({
    callId,
    toolName,
    input: { callId },
    result: { status: "ok", output },
    actorKey,
  })!
}

/** Un tour complet : question, réponse, et ses appels d'outils. */
function tour(
  requestId: string,
  minutesAvant: number,
  toolCalls: AppelEnregistre[]
): { messages: MessageHistorique[]; tour: TourHistorique } {
  return {
    messages: [
      { role: "user", content: `Question ${requestId}`, requestId },
      {
        role: "assistant",
        content: `Réponse ${requestId}`,
        requestId,
        status: "termine",
      },
    ],
    tour: {
      requestId,
      createdAt: MAINTENANT - minutesAvant * 60_000,
      toolCalls,
    },
  }
}

function historique(
  tours: Array<ReturnType<typeof tour>>,
  options: {
    acteurCourant?: string
    outils?: Set<string>
    executions?: Parameters<typeof construireHistorique>[0]["executions"]
    messagesEnPlus?: MessageHistorique[]
  } = {}
) {
  return construireHistorique({
    messages: [
      ...tours.flatMap((item) => item.messages),
      ...(options.messagesEnPlus ?? []),
    ],
    tours: tours.map((item) => item.tour),
    executions: options.executions ?? {},
    acteurCourant: options.acteurCourant ?? COMPTE,
    outilsDisponibles: options.outils ?? TOUS_LES_OUTILS,
    maintenant: MAINTENANT,
  })
}

function echanges(entrees: ReturnType<typeof historique>) {
  return entrees.filter(
    (entree): entree is ReplayedToolExchange => entree.role === "tools"
  )
}

describe("réduction des sorties rejouées", () => {
  it("ne garde d'une recherche que l'essentiel des trajets, et dit combien sont omis", () => {
    const reduit = JSON.parse(reduirePourRejeu("search_trips", recherche(12)))
    expect(reduit.trips).toHaveLength(TRAJETS_REJOUES_MAX)
    expect(reduit.tripsOmis).toBe(12 - TRAJETS_REJOUES_MAX)
    expect(reduit.trips[0]).toEqual({
      tripId: "trip-0",
      trainNumber: "200",
      trainType: "Express",
      departureTime: "07:40",
      arrivalTime: "19:10",
      cancelled: false,
      hasAvailability: true,
      availableByClass: { DEUXIEME: 40, PREMIERE: 12, VIP: 4 },
      prixParClasse: { DEUXIEME: { totalTtc: 34_500, unitaireTtc: 34_500 } },
    })
    // Les horodatages bruts, que le modèle ne doit pas convertir, partent.
    expect(reduit.trips[0]).not.toHaveProperty("departureAt")
    expect(reduit).toMatchObject({
      originStationId: "station-owendo",
      serviceDate: "2026-10-01",
      passengers: 1,
    })
  })

  it("résume une desserte : arrêts en heures de Libreville, places par tronçon", () => {
    const depart = Date.UTC(2026, 9, 1, 7, 0) // 08:00 à Libreville
    const desserte = {
      trip: {
        _id: "trip-201",
        _creationTime: 1,
        trainNumber: "201",
        trainType: "Express",
        serviceDate: "2026-10-01",
        status: "programme",
        delayMinutes: 0,
        compositionId: "composition-interne",
      },
      stops: Array.from({ length: 23 }, (_, index) => ({
        _id: `stop-${index}`,
        _creationTime: 1,
        tripId: "trip-201",
        stationId: `station-${index}`,
        sequence: index,
        arrivalAt: index === 0 ? undefined : depart + index * 30 * 60_000,
        departureAt: index === 22 ? undefined : depart + index * 30 * 60_000 + 120_000,
        station: {
          _id: `station-${index}`,
          _creationTime: 1,
          code: `S${index}`,
          name: `Gare ${index}`,
          province: "Estuaire",
          kilometerPoint: index * 30,
          isEquipped: true,
          isActive: true,
        },
      })),
      availability: ["DEUXIEME", "PREMIERE", "VIP"].flatMap((serviceClass) =>
        Array.from({ length: 22 }, (_, segmentIndex) => ({
          serviceClass,
          segmentIndex,
          available: 40 - segmentIndex,
        }))
      ),
    }
    expect(JSON.stringify(desserte).length).toBeGreaterThan(SORTIE_REJEU_MAX)
    const reduit = JSON.parse(reduirePourRejeu("get_trip", desserte))
    expect(reduit).not.toHaveProperty("status", "omitted")
    expect(reduit.trip).toEqual({
      trainNumber: "201",
      trainType: "Express",
      serviceDate: "2026-10-01",
      status: "programme",
      delayMinutes: 0,
    })
    expect(reduit.stops).toHaveLength(23)
    expect(reduit.stops[0]).toEqual({
      stationId: "station-0",
      name: "Gare 0",
      arrivalTime: null,
      departureTime: "08:02",
    })
    expect(reduit.availableBySegment.DEUXIEME).toHaveLength(22)
    expect(reduit.availableBySegment.VIP[21]).toBe(19)
  })

  it("tronque proprement un gros résultat, toujours en JSON valide", () => {
    const liste = Array.from({ length: 200 }, (_, index) => ({
      reference: `SET-${index}`,
      detail: "x".repeat(40),
    }))
    const borne = bornerJson(liste, SORTIE_REJEU_MAX)
    expect(borne.length).toBeLessThanOrEqual(SORTIE_REJEU_MAX)
    const relu = JSON.parse(borne) as Array<Record<string, unknown>>
    expect(relu[relu.length - 1]).toEqual({ elementsOmis: 200 - (relu.length - 1) })
    expect(relu[0]).toEqual(liste[0])

    const objet = bornerJson({ total: 200, tickets: liste }, SORTIE_REJEU_MAX)
    expect(objet.length).toBeLessThanOrEqual(SORTIE_REJEU_MAX)
    expect(JSON.parse(objet)).toMatchObject({ total: 200 })
    expect(JSON.parse(objet).ticketsOmis).toBeGreaterThan(0)

    // Deux tableaux trop lourds : le plus lourd se vide, l'autre raccourcit.
    const deux = bornerJson(
      { stops: liste, availability: liste.slice(0, 100) },
      SORTIE_REJEU_MAX
    )
    expect(deux.length).toBeLessThanOrEqual(SORTIE_REJEU_MAX)
    expect(JSON.parse(deux)).toMatchObject({ stops: [], stopsOmis: 200 })
    expect(JSON.parse(deux).availability.length).toBeGreaterThan(0)

    const indivisible = bornerJson({ texte: "x".repeat(10_000) }, 500)
    expect(JSON.parse(indivisible)).toMatchObject({ status: "omitted" })
  })

  it("n'enregistre pas les liens temporaires ; garde la confirmation sans sortie", () => {
    expect(
      appelAEnregistrer({
        callId: "pdf-1",
        toolName: "get_ticket_download_url",
        input: { ticketId: "t" },
        result: { status: "ok", output: { url: "https://exemple/billet.pdf" } },
        actorKey: COMPTE,
      })
    ).toBeNull()
    expect(
      appelAEnregistrer({
        callId: "booking-1",
        toolName: "create_booking",
        input: { tripId: "trip-1" },
        result: { status: "approval_required" },
        actorKey: COMPTE,
      })
    ).toEqual({
      callId: "booking-1",
      toolName: "create_booking",
      inputJson: JSON.stringify({ tripId: "trip-1" }),
      status: "approval_required",
      actorKey: COMPTE,
    })
  })
})

describe("historique rejoué au modèle", () => {
  it("place les appels d'un tour avant sa réponse et ignore les réponses non terminées", () => {
    const premier = tour("r1", 5, [
      appel("stations-1", "list_stations", [{ id: "s1", name: "Owendo" }]),
      appel("search-1", "search_trips", recherche(2)),
    ])
    const entrees = historique([premier], {
      messagesEnPlus: [
        { role: "tool", content: "{}", requestId: undefined },
        { role: "user", content: "Et le retour ?", requestId: "r2" },
        { role: "assistant", content: "", requestId: "r2", status: "en_cours" },
      ],
    })
    expect(entrees.map((entree) => entree.role)).toEqual([
      "user",
      "tools",
      "assistant",
      "user",
    ])
    const [echange] = echanges(entrees)
    expect(echange!.calls.map((call) => call.callId)).toEqual([
      "stations-1",
      "search-1",
    ])
    expect(echange!.calls[0]).toEqual({
      callId: "stations-1",
      name: "list_stations",
      input: { callId: "stations-1" },
      output: [{ id: "s1", name: "Owendo" }],
    })
  })

  it("borne le nombre de tours, l'âge et le volume rejoués", () => {
    const tours = Array.from({ length: TOURS_REJOUES + 2 }, (_, index) =>
      tour(`r${index}`, 25 - index, [
        appel(`stations-${index}`, "list_stations", [{ id: `s${index}` }]),
      ])
    )
    const rejoues = echanges(historique(tours)).flatMap((echange) =>
      echange.calls.map((call) => call.callId)
    )
    // Seuls les tours les plus récents qui ont appelé un outil.
    expect(rejoues).toEqual(
      tours
        .slice(-TOURS_REJOUES)
        .map((_, index) => `stations-${tours.length - TOURS_REJOUES + index}`)
    )

    const vieux = tour("ancien", AGE_MAX_REJEU_MS / 60_000 + 1, [
      appel("stations-vieux", "list_stations", [{ id: "s" }]),
    ])
    expect(echanges(historique([vieux]))).toEqual([])

    // Budget total : les plus récents d'abord, jamais au-delà.
    const lourds = Array.from({ length: 3 }, (_, index) =>
      tour(`lourd-${index}`, 10 - index, [
        appel(`recherche-${index}`, "search_trips", recherche(8)),
        appel(`recherche-bis-${index}`, "search_trips", recherche(8)),
      ])
    )
    const rejouesLourds = echanges(historique(lourds))
    const volume = rejouesLourds
      .flatMap((echange) => echange.calls)
      .reduce(
        (total, call) =>
          total + JSON.stringify(call.input).length + JSON.stringify(call.output).length,
        0
      )
    expect(volume).toBeLessThanOrEqual(BUDGET_REJEU)
    expect(rejouesLourds[0]!.calls.length).toBeGreaterThan(0)
    const tousLesAppels = rejouesLourds.flatMap((echange) =>
      echange.calls.map((call) => call.callId)
    )
    // Les plus récents d'abord ; le plus ancien appel ne tient plus.
    expect(tousLesAppels).toContain("recherche-2")
    expect(tousLesAppels).toContain("recherche-bis-2")
    expect(tousLesAppels.length).toBeLessThan(6)
    expect(tousLesAppels).not.toContain("recherche-bis-0")
  })

  it("après un rattachement (claim), ne rejoue au compte que les données publiques de l'invité", () => {
    const invite = tour("r-invite", 3, [
      appel("stations-invite", "list_stations", [{ id: "s1" }], ACTEUR_INVITE),
      appel(
        "booking-invite",
        "get_booking",
        { sale: { number: "SET-2026-0001" }, tickets: [] },
        ACTEUR_INVITE
      ),
    ])
    const compte = tour("r-compte", 1, [
      appel("tickets-compte", "list_my_tickets", [{ reference: "SET-A" }]),
    ])

    // L'invité lui-même relit tout ce qu'il a obtenu.
    expect(
      echanges(historique([invite], { acteurCourant: ACTEUR_INVITE }))[0]!.calls.map(
        (call) => call.callId
      )
    ).toEqual(["stations-invite", "booking-invite"])

    // Le compte qui a rattaché la conversation : gares oui, dossier consulté
    // par téléphone non ; ses propres billets oui.
    const rejoues = echanges(historique([invite, compte])).flatMap((echange) =>
      echange.calls.map((call) => call.callId)
    )
    expect(rejoues).toEqual(["stations-invite", "tickets-compte"])

    // Un autre compte (conversation d'un autre acteur) ne relit rien de privé.
    const autre = cleActeur({ userId: "user-autre" })
    expect(
      echanges(historique([compte], { acteurCourant: autre }))
    ).toEqual([])
  })

  it("ne rejoue pas un outil qui n'est plus ouvert à l'acteur courant", () => {
    const signIn = tour("r-sign", 2, [
      appel("sign-1", "request_sign_in", { reason: "vos billets" }, ACTEUR_INVITE),
      appel("stations-1", "list_stations", [{ id: "s1" }], ACTEUR_INVITE),
    ])
    const rejoues = echanges(
      historique([signIn], {
        acteurCourant: ACTEUR_INVITE,
        outils: new Set(["list_stations"]),
      })
    ).flatMap((echange) => echange.calls.map((call) => call.callId))
    expect(rejoues).toEqual(["stations-1"])
  })

  it("relit une confirmation dans son état actuel, pour son seul acteur", () => {
    const confirmation = (callId: string) =>
      appelAEnregistrer({
        callId,
        toolName: "create_booking",
        input: { tripId: "trip-1" },
        result: { status: "approval_required" },
        actorKey: COMPTE,
      })!
    const tours = [
      tour("r-ouverte", 4, [confirmation("ouverte")]),
      tour("r-confirmee", 3, [confirmation("confirmee")]),
      tour("r-annulee", 2, [confirmation("annulee")]),
    ]
    const executions = {
      ouverte: { status: "approval_required" as const },
      confirmee: {
        status: "succeeded" as const,
        outputJson: JSON.stringify({ reference: "SET-2026-0042", amountTtc: 34_500 }),
      },
      annulee: { status: "rejected" as const },
    }
    const sorties = Object.fromEntries(
      echanges(historique(tours, { executions }))
        .flatMap((echange) => echange.calls)
        .map((call) => [call.callId, call.output])
    )
    expect(sorties.ouverte).toMatchObject({ status: "approval_required" })
    expect(sorties.confirmee).toEqual({
      status: "confirmed",
      result: { reference: "SET-2026-0042", amountTtc: 34_500 },
    })
    expect(sorties.annulee).toMatchObject({ status: "rejected" })

    expect(
      echanges(historique(tours, { executions, acteurCourant: ACTEUR_INVITE }))
    ).toEqual([])
  })

  it("relit toujours une confirmation ouverte, même hors fenêtre et hors budget", () => {
    const ouverte = tour("r-carte", 50, [
      appelAEnregistrer({
        callId: "carte",
        toolName: "create_booking",
        input: { tripId: "trip-1" },
        result: { status: "approval_required" },
        actorKey: COMPTE,
      })!,
    ])
    // Des tours plus récents, lourds, épuisent la fenêtre et le budget.
    const recents = Array.from({ length: TOURS_REJOUES + 1 }, (_, index) =>
      tour(`r-recherche-${index}`, 5 - index, [
        appel(`recherche-${index}`, "search_trips", recherche(8)),
        appel(`recherche-bis-${index}`, "search_trips", recherche(8)),
      ])
    )
    const rejoues = echanges(
      historique([ouverte, ...recents], {
        executions: { carte: { status: "approval_required" } },
      })
    ).flatMap((echange) => echange.calls)
    expect(rejoues.find((call) => call.callId === "carte")?.output).toMatchObject({
      status: "approval_required",
    })
  })

  it("dans une messagerie, dit expirée une confirmation dont les boutons ont expiré", () => {
    const confirmation = (requestId: string, minutes: number) =>
      tour(requestId, minutes, [
        appelAEnregistrer({
          callId: requestId,
          toolName: "create_booking",
          input: { tripId: "trip-1" },
          result: { status: "approval_required" },
          actorKey: COMPTE,
        })!,
      ])
    const tours = [confirmation("vieille", 20), confirmation("recente", 5)]
    const executions = {
      vieille: { status: "approval_required" as const },
      recente: { status: "approval_required" as const },
    }
    const sorties = (expirationConfirmationMs?: number) =>
      Object.fromEntries(
        echanges(
          construireHistorique({
            messages: tours.flatMap((item) => item.messages),
            tours: tours.map((item) => item.tour),
            executions,
            acteurCourant: COMPTE,
            outilsDisponibles: TOUS_LES_OUTILS,
            maintenant: MAINTENANT,
            expirationConfirmationMs,
          })
        )
          .flatMap((echange) => echange.calls)
          .map((call) => [call.callId, (call.output as { status: string }).status])
      )
    expect(sorties(15 * 60_000)).toEqual({
      vieille: "expired",
      recente: "approval_required",
    })
    // Sur le site, la carte reste valable tant qu'elle n'est pas tranchée.
    expect(sorties()).toEqual({
      vieille: "approval_required",
      recente: "approval_required",
    })
  })
})
