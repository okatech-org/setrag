"use node"

import { createSign } from "node:crypto"
import { deflateSync } from "node:zlib"

import { PKPass } from "passkit-generator"

import type { TicketPrintData } from "./ticketPdf"

export interface WalletTicketData extends TicketPrintData {
  readonly departureAt: number
  readonly arrivalAt: number
}

interface GoogleWalletConfig {
  readonly issuerId: string
  readonly serviceAccountEmail: string
  readonly privateKey: string
  readonly siteUrl: string
}

interface AppleWalletConfig {
  readonly passTypeIdentifier: string
  readonly teamIdentifier: string
  readonly signerCertificate: string
  readonly signerPrivateKey: string
  readonly wwdrCertificate: string
}

function localized(value: string) {
  return {
    defaultValue: {
      language: "fr-FR",
      value,
    },
  }
}

/**
 * Les identifiants Google Wallet n'acceptent que lettres, chiffres, `.`, `_`
 * et `-`. Le préfixe stable évite aussi de recréer un pass à chaque clic.
 */
export function walletObjectSuffix(ticketNumber: string): string {
  const suffix = ticketNumber.replace(/[^A-Za-z0-9._-]/g, "_")
  return `setrag_ticket_${suffix}`
}

function base64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url")
}

export function signGoogleWalletJwt(
  claims: Record<string, unknown>,
  privateKey: string
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64Url(JSON.stringify(claims))
  const unsigned = `${header}.${payload}`
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey)
  return `${unsigned}.${base64Url(signature)}`
}

export function createGoogleWalletUrl(
  data: WalletTicketData,
  config: GoogleWalletConfig
): string {
  const classId = `${config.issuerId}.setrag_train_ticket`
  const objectId = `${config.issuerId}.${walletObjectSuffix(data.number)}`
  const seat = data.seatLabel
    ? `${data.coachLabel ? `${data.coachLabel} · ` : ""}${data.seatLabel}`
    : "Placement libre"

  const claims = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: [new URL(config.siteUrl).origin],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: objectId,
          classId,
          state: "ACTIVE",
          cardTitle: localized("SETRAG · Transgabonais"),
          header: localized(`${data.origin.name} → ${data.destination.name}`),
          subheader: localized(`Train ${data.trainNumber}`),
          hexBackgroundColor: "#0F50A0",
          barcode: {
            type: "QR_CODE",
            value: data.barcode,
            alternateText: data.number,
          },
          validTimeInterval: {
            start: {
              date: new Date(data.departureAt - 6 * 60 * 60_000).toISOString(),
            },
            end: {
              date: new Date(data.arrivalAt + 24 * 60 * 60_000).toISOString(),
            },
          },
          textModulesData: [
            {
              id: "passenger",
              header: "VOYAGEUR",
              body: `${data.passenger.firstName} ${data.passenger.lastName}`,
            },
            {
              id: "schedule",
              header: "HORAIRES",
              body: `${data.serviceDate} · ${data.departureLabel} → ${data.arrivalLabel}`,
            },
            {
              id: "seat",
              header: "CLASSE ET PLACE",
              body: `${data.serviceClass} · ${seat}`,
            },
            {
              id: "booking",
              header: "RÉSERVATION",
              body: data.saleNumber,
            },
          ],
          linksModuleData: {
            uris: [
              {
                id: "booking",
                uri: `${config.siteUrl.replace(/\/$/, "")}/reservation/${encodeURIComponent(data.saleNumber)}`,
                description: "Voir ma réservation SETRAG",
              },
            ],
          },
        },
      ],
    },
  }

  const token = signGoogleWalletJwt(claims, config.privateKey)
  return `https://pay.google.com/gp/v/save/${token}`
}

// PNG RGBA minimal, généré à la volée : Apple exige un icon.png mais le
// logotype principal reste du texte pour conserver une netteté parfaite.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])))
  return Buffer.concat([length, typeBytes, Buffer.from(data), checksum])
}

function solidIcon(size: number): Buffer {
  const scanlines = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    scanlines[row] = 0
    for (let x = 0; x < size; x += 1) {
      const pixel = row + 1 + x * 4
      scanlines[pixel] = 0x0f
      scanlines[pixel + 1] = 0x50
      scanlines[pixel + 2] = 0xa0
      scanlines[pixel + 3] = 0xff
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

export function createAppleWalletPass(
  data: WalletTicketData,
  config: AppleWalletConfig
): Buffer {
  const pass = new PKPass(
    {
      "icon.png": solidIcon(29),
      "icon@2x.png": solidIcon(58),
    },
    {
      wwdr: config.wwdrCertificate,
      signerCert: config.signerCertificate,
      signerKey: config.signerPrivateKey,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      organizationName: "SETRAG",
      description: `Billet SETRAG ${data.number}`,
      serialNumber: data.number,
      groupingIdentifier: data.saleNumber,
      logoText: "SETRAG · Transgabonais",
      backgroundColor: "rgb(15, 80, 160)",
      foregroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(208, 229, 255)",
    }
  )

  pass.type = "boardingPass"
  pass.transitType = "PKTransitTypeTrain"
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: data.barcode,
    messageEncoding: "iso-8859-1",
    altText: data.number,
  })
  pass.setRelevantDate(new Date(data.departureAt))
  pass.setExpirationDate(new Date(data.arrivalAt + 24 * 60 * 60_000))
  pass.primaryFields.push(
    {
      key: "origin",
      label: "DÉPART",
      value: data.origin.name,
    },
    {
      key: "destination",
      label: "ARRIVÉE",
      value: data.destination.name,
    }
  )
  pass.secondaryFields.push(
    {
      key: "departure",
      label: "DÉPART",
      value: new Date(data.departureAt),
      dateStyle: "PKDateStyleMedium",
      timeStyle: "PKDateStyleShort",
    },
    {
      key: "train",
      label: "TRAIN",
      value: data.trainNumber,
    }
  )
  pass.auxiliaryFields.push(
    {
      key: "passenger",
      label: "VOYAGEUR",
      value: `${data.passenger.firstName} ${data.passenger.lastName}`,
    },
    {
      key: "class",
      label: "CLASSE",
      value: data.serviceClass,
    },
    {
      key: "seat",
      label: "PLACE",
      value: data.seatLabel
        ? `${data.coachLabel ? `${data.coachLabel} · ` : ""}${data.seatLabel}`
        : "Libre",
    }
  )
  pass.backFields.push(
    { key: "ticket", label: "Billet", value: data.number },
    { key: "booking", label: "Réservation", value: data.saleNumber },
    {
      key: "instructions",
      label: "Avant le départ",
      value:
        "Présentez-vous en gare 45 minutes avant le départ avec une pièce d’identité.",
    }
  )

  return pass.getAsBuffer()
}
