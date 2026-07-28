import { generateKeyPairSync, verify } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import {
  createGoogleWalletUrl,
  walletObjectSuffix,
  type WalletTicketData,
} from "./walletPass"

const ticket: WalletTicketData = {
  number: "BT/2026 001",
  barcode: "SETRAG1:SIGNED",
  passenger: { firstName: "Ariane", lastName: "Moussavou" },
  origin: { code: "OWE", name: "Owendo" },
  destination: { code: "FVE", name: "Franceville" },
  serviceDate: "2026-08-07",
  departureAt: Date.UTC(2026, 7, 7, 7),
  arrivalAt: Date.UTC(2026, 7, 7, 19),
  departureLabel: "08h00",
  arrivalLabel: "20h00",
  trainNumber: "TR-201",
  serviceClass: "premiere",
  coachLabel: "V1",
  seatLabel: "12A",
  priceTtc: 35_000,
  saleNumber: "V-LIGNE-20260807-000001",
  status: "valide",
  isDemoKey: false,
}

describe("walletPass", () => {
  it("fabrique un identifiant Google stable et autorisé", () => {
    expect(walletObjectSuffix("BT/2026 001")).toBe("setrag_ticket_BT_2026_001")
  })

  it("signe un JWT Google Wallet RS256 contenant le billet", () => {
    vi.setSystemTime(new Date("2026-07-28T00:00:00Z"))
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })

    const url = createGoogleWalletUrl(ticket, {
      issuerId: "3388000000023143702",
      serviceAccountEmail: "wallet@example.iam.gserviceaccount.com",
      privateKey: privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      siteUrl: "https://billets.setrag.ga",
    })
    const token = url.split("/").pop()!
    const [header, payload, signature] = token.split(".")
    const claims = JSON.parse(
      Buffer.from(payload!, "base64url").toString("utf8")
    )

    expect(
      JSON.parse(Buffer.from(header!, "base64url").toString("utf8"))
    ).toEqual({ alg: "RS256", typ: "JWT" })
    expect(claims.iss).toBe("wallet@example.iam.gserviceaccount.com")
    expect(claims.payload.genericObjects[0]).toMatchObject({
      id: "3388000000023143702.setrag_ticket_BT_2026_001",
      state: "ACTIVE",
      barcode: { value: "SETRAG1:SIGNED" },
    })
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature!, "base64url")
      )
    ).toBe(true)
  })
})
