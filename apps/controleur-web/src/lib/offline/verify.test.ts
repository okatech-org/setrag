import { describe, expect, it } from "vitest"
import {
  publicKeyHex,
  signTicket,
} from "../../../../../packages/backend/convex/lib/signature"
import type { TicketPayload } from "@workspace/backend/barcode"
import { scanResult } from "@workspace/backend/schema"

import { toScanResult, verifyLocally } from "./verify"
import type {
  EmbarkedManifest,
  EmbarkedSubscription,
  EmbarkedTicket,
  LocalScan,
  Verdict,
} from "./types"

/**
 * Le contrôle hors ligne est la garantie centrale de cette application : un
 * verdict rendu dans un tunnel doit valoir celui rendu en gare. Ces tests
 * signent de vrais titres avec la clé du backend et vérifient que le terminal
 * en tire les mêmes conclusions.
 */

const TRIP = "trip_test_0001"
const DEPART = Date.parse("2026-08-14T18:20:00Z")

function manifest(patch: Partial<EmbarkedManifest> = {}): EmbarkedManifest {
  return {
    tripId: TRIP,
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-08-14",
    departureAt: DEPART,
    originName: "Owendo",
    destinationName: "Franceville",
    segmentCount: 3,
    stops: [
      { sequence: 0, stationId: "s0", code: "OWE", name: "Owendo", kilometerPoint: 0 },
      { sequence: 1, stationId: "s1", code: "BOO", name: "Booué", kilometerPoint: 340 },
      { sequence: 2, stationId: "s2", code: "MOA", name: "Moanda", kilometerPoint: 583 },
      { sequence: 3, stationId: "s3", code: "FCV", name: "Franceville", kilometerPoint: 648 },
    ],
    fare: null,
    penalties: [],
    signing: { publicKey: publicKeyHex(), keyVersion: 1, isDemoKey: true },
    ticketCount: 1,
    downloadedCount: 1,
    cursor: null,
    complete: true,
    updatedAt: DEPART,
    ...patch,
  }
}

function payload(patch: Partial<TicketPayload> = {}): TicketPayload {
  return {
    v: 1,
    k: 1,
    kind: "billet",
    ref: "B-4821",
    trip: TRIP,
    date: "2026-08-14",
    cls: "DEUXIEME",
    from: 0,
    to: 3,
    seat: "12A",
    exp: Math.floor(DEPART / 1000) + 86_400,
    ...patch,
  }
}

function ticket(patch: Partial<EmbarkedTicket> = {}): EmbarkedTicket {
  return {
    _id: "t1",
    number: "B-4821",
    passenger: { lastName: "MBADINGA", firstName: "Paul", gender: "M" },
    serviceClass: "DEUXIEME",
    seatLabel: "12A",
    coachLabel: "1",
    fromStopIndex: 0,
    toStopIndex: 3,
    status: "valide",
    ...patch,
  }
}

const NOW = DEPART + 60 * 60 * 1000

describe("Vérification locale d'un titre", () => {
  it("accepte un titre authentique sur son segment", () => {
    const { barcode } = signTicket(payload())
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      ticket: ticket(),
      now: NOW,
    })
    expect(r.verdict).toBe("valide")
    expect(r.ticket?.passenger.lastName).toBe("MBADINGA")
    expect(toScanResult(r.verdict)).toBe("valide")
  })

  it("démasque un code dont la charge utile a été retouchée", () => {
    const { barcode } = signTicket(payload())
    // On altère un caractère du corps signé : la signature ne colle plus.
    const index = barcode.length - 40
    const altered =
      barcode.slice(0, index) +
      (barcode[index] === "A" ? "B" : "A") +
      barcode.slice(index + 1)

    const r = verifyLocally(altered, {
      manifest: manifest(),
      currentStopIndex: 1,
      ticket: ticket(),
      now: NOW,
    })
    expect(["contrefait", "illisible"]).toContain(r.verdict)
    expect(toScanResult(r.verdict)).not.toBe("valide")
  })

  it("distingue un code étranger d'une contrefaçon", () => {
    const r = verifyLocally("HELLO-WORLD", {
      manifest: manifest(),
      currentStopIndex: 0,
      now: NOW,
    })
    expect(r.verdict).toBe("illisible")
  })

  it("refuse un titre émis pour une autre desserte", () => {
    const { barcode } = signTicket(payload({ trip: "trip_autre" }))
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      now: NOW,
    })
    expect(r.verdict).toBe("mauvaise_desserte")
    // Deux circulations d'un même train peuvent coexister le même jour : le
    // motif doit nommer celle qui est embarquée, sinon l'agent voit « mauvaise
    // desserte » sur un titre qui est bien celui de son train.
    // Avec le nom du billet, pas le code interne « TR-201 ».
    expect(r.reason).toContain("l'Express 201")
    expect(r.reason).not.toContain("TR-201")
    expect(r.reason).toMatch(/manifeste/i)
  })

  it("refuse un voyageur au-delà de son parcours payé", () => {
    const { barcode } = signTicket(payload({ from: 0, to: 1 }))
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 2,
      ticket: ticket({ toStopIndex: 1 }),
      now: NOW,
    })
    expect(r.verdict).toBe("hors_segment")
    expect(toScanResult(r.verdict)).toBe("hors_segment")
  })

  it("refuse un titre dont la validité est passée", () => {
    const { barcode } = signTicket(
      payload({ exp: Math.floor(NOW / 1000) - 10 })
    )
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      now: NOW,
    })
    expect(r.verdict).toBe("expire")
  })

  it("oppose l'annulation connue du manifeste", () => {
    const { barcode } = signTicket(payload())
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      ticket: ticket({ status: "annule" }),
      now: NOW,
    })
    expect(r.verdict).toBe("annule")
    // La source compte : l'agent doit savoir que la fraîcheur est en jeu.
    expect(r.fromManifest).toBe(true)
  })

  it("détecte un repassage sur le même terminal et donne l'heure du premier", () => {
    const { barcode } = signTicket(payload())
    const premier: LocalScan = {
      clientScanId: "c1",
      tripId: TRIP,
      ticketNumber: "B-4821",
      result: "valide",
      verdict: "valide",
      scannedAt: NOW - 34 * 60 * 1000,
      offline: true,
      state: "pending",
    }
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      ticket: ticket(),
      priorScans: [premier],
      now: NOW,
    })
    expect(r.verdict).toBe("deja_controle")
    expect(r.firstScanAt).toBe(premier.scannedAt)
    expect(toScanResult(r.verdict)).toBe("deja_controle")
  })

  it("ne confond pas un manifeste incomplet avec une fraude", () => {
    const { barcode } = signTicket(payload())
    const r = verifyLocally(barcode, {
      manifest: manifest({ complete: false, downloadedCount: 612 }),
      currentStopIndex: 1,
      now: NOW,
    })
    expect(r.verdict).toBe("inconnu")
    expect(r.reason).toMatch(/incomplet/)
  })

  it("signale une clé retirée du service plutôt qu'une contrefaçon", () => {
    const { barcode } = signTicket(payload())
    const r = verifyLocally(barcode, {
      manifest: manifest({
        signing: { publicKey: publicKeyHex(), keyVersion: 2, isDemoKey: true },
      }),
      currentStopIndex: 1,
      now: NOW,
    })
    expect(r.verdict).toBe("cle_hors_service")
  })

  it("accepte un abonnement dans sa période de validité", () => {
    const { barcode } = signTicket(
      payload({ kind: "abonnement", ref: "A-0912" })
    )
    const abonnement: EmbarkedSubscription = {
      _id: "sub1",
      cardNumber: "A-0912",
      kind: "AN",
      serviceClass: "DEUXIEME",
      validFrom: DEPART - 10 * 86_400_000,
      validUntil: DEPART + 10 * 86_400_000,
    }
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      subscription: abonnement,
      now: NOW,
    })
    expect(r.verdict).toBe("abonnement")
    expect(toScanResult(r.verdict)).toBe("valide")
  })

  it("refuse un abonnement hors période", () => {
    const { barcode } = signTicket(
      payload({ kind: "abonnement", ref: "A-0912" })
    )
    const r = verifyLocally(barcode, {
      manifest: manifest(),
      currentStopIndex: 1,
      subscription: {
        _id: "sub1",
        cardNumber: "A-0912",
        kind: "AN",
        serviceClass: "DEUXIEME",
        validFrom: DEPART - 60 * 86_400_000,
        validUntil: DEPART - 30 * 86_400_000,
      },
      now: NOW,
    })
    expect(r.verdict).toBe("expire")
  })
})

/* ═══════════ Accord entre le terminal et le schéma du serveur ════════════ */

describe("Résultats de contrôle", () => {
  /**
   * Le terminal ne doit jamais produire un résultat que le serveur refuse :
   * la validation d'arguments de Convex rejetterait le LOT ENTIER, et un
   * contrôleur perdrait la remontée de toute une voiture pour un seul billet
   * froissé. Ce test compare les deux énumérations plutôt que de faire
   * confiance à la relecture.
   */
  it("n'émet que des valeurs connues du schéma Convex", () => {
    const attendus = new Set(
      (scanResult.members as ReadonlyArray<{ value: string }>).map(
        (member) => member.value
      )
    )

    const verdicts: Verdict[] = [
      "valide",
      "abonnement",
      "contrefait",
      "illisible",
      "cle_hors_service",
      "mauvaise_desserte",
      "hors_segment",
      "expire",
      "annule",
      "rembourse",
      "deja_controle",
      "non_paye",
      "inconnu",
    ]

    for (const verdict of verdicts) {
      expect(attendus).toContain(toScanResult(verdict))
    }
  })

  it("consigne le refus tel qu'il a été constaté", () => {
    // Un code abîmé n'est pas une contrefaçon : le journal doit les séparer.
    expect(toScanResult("illisible")).toBe("illisible")
    expect(toScanResult("contrefait")).toBe("signature_invalide")
    expect(toScanResult("abonnement")).toBe("valide")
    expect(toScanResult("deja_controle")).toBe("deja_controle")
  })
})
