import { generateKeyPairSync, verify } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import { IMAGES_WALLET } from "./walletImages"
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
  departureLabel: "08:00",
  arrivalLabel: "20:00",
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
      // Aztec, comme le billet PDF.
      barcode: { type: "AZTEC", value: "SETRAG1:SIGNED" },
    })
    // À la charte : fond encre du billet, logo de la billetterie, libellés
    // du site.
    const objet = claims.payload.genericObjects[0]
    expect(objet.hexBackgroundColor).toBe("#131B26")
    expect(objet.logo.sourceUri.uri).toBe(
      "https://billets.setrag.ga/icons/icon-192.png"
    )
    expect(objet.subheader.defaultValue.value).toBe("Train 201")
    expect(objet.textModulesData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          header: "Horaires",
          body: "Ven. 7 août 2026 · 08:00 → 20:00",
        }),
        expect.objectContaining({
          header: "Classe et place",
          body: "1re · V1 · 12A",
        }),
      ])
    )
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature!, "base64url")
      )
    ).toBe(true)
  })

  it("embarque l'icône et le logo du pass Apple aux tailles d'Apple", () => {
    const tailles: Record<string, [number, number]> = {
      "icon.png": [29, 29],
      "icon@2x.png": [58, 58],
      "icon@3x.png": [87, 87],
      "logo.png": [111, 50],
      "logo@2x.png": [223, 100],
      "logo@3x.png": [334, 150],
    }
    for (const [nom, [largeur, hauteur]] of Object.entries(tailles)) {
      const png = Buffer.from(
        IMAGES_WALLET[nom as keyof typeof IMAGES_WALLET],
        "base64"
      )
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
        largeur,
        hauteur,
      ])
      // Apple borne le logo à 160 × 50 points.
      expect(largeur / (hauteur / 50)).toBeLessThanOrEqual(160)
    }
  })
})
