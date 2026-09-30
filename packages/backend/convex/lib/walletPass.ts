"use node"

import { createSign } from "node:crypto"

import { PKPass } from "passkit-generator"

import { classeCourte, dateBillet, nomTrain } from "./libellesBillet"
import type { TicketPrintData } from "./ticketPdf"
import { IMAGES_WALLET } from "./walletImages"

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

/**
 * Couleurs du pass : celles du billet du site — fond encre, texte clair,
 * libellés atténués. Conversion sRGB des valeurs oklch de
 * `packages/ui/src/styles/tokens.css` (portage, pas seconde source de
 * vérité ; même conversion que `pdfMarque.ts`).
 */
const COULEURS_PASS = {
  /** --brand-encre · oklch(0.22 0.025 257) */
  fond: { hex: "#131B26", rgb: "rgb(19, 27, 38)" },
  /** texte du billet · oklch(0.97 0.006 257) */
  texte: "rgb(243, 245, 249)",
  /** libellés · oklch(0.76 0.016 257) */
  libelle: "rgb(171, 178, 187)",
} as const

/** « 1re · V2 · 12A », « 2e · Placement libre » */
function classeEtPlace(data: WalletTicketData): string {
  const place = data.seatLabel
    ? `${data.coachLabel ? `${data.coachLabel} · ` : ""}${data.seatLabel}`
    : "Placement libre"
  return `${classeCourte(data.serviceClass)} · ${place}`
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
  const site = config.siteUrl.replace(/\/$/, "")

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
          subheader: localized(nomTrain(data.trainType, data.trainNumber)),
          hexBackgroundColor: COULEURS_PASS.fond.hex,
          // L'icône d'application de la billetterie (le S et son ruban),
          // servie par le site : Google exige une image publique.
          logo: {
            sourceUri: { uri: `${site}/icons/icon-192.png` },
            contentDescription: localized("SETRAG"),
          },
          // Aztec, comme le billet PDF et le billet du site : un seul symbole
          // à reconnaître pour le voyageur comme pour le contrôleur.
          barcode: {
            type: "AZTEC",
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
              header: "Voyageur",
              body: `${data.passenger.firstName} ${data.passenger.lastName}`,
            },
            {
              id: "schedule",
              header: "Horaires",
              body: `${dateBillet(data.serviceDate)} · ${data.departureLabel} → ${data.arrivalLabel}`,
            },
            {
              id: "seat",
              header: "Classe et place",
              body: classeEtPlace(data),
            },
            {
              id: "booking",
              header: "Réservation",
              body: data.saleNumber,
            },
          ],
          linksModuleData: {
            uris: [
              {
                id: "booking",
                uri: `${site}/billets/${encodeURIComponent(data.saleNumber)}`,
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

/** Images du pass (icône, logo), générées par scripts/generer-images-wallet.mjs. */
function imagesDuPass(): Record<string, Buffer> {
  return Object.fromEntries(
    Object.entries(IMAGES_WALLET).map(([nom, base64]) => [
      nom,
      Buffer.from(base64, "base64"),
    ])
  )
}

export function createAppleWalletPass(
  data: WalletTicketData,
  config: AppleWalletConfig
): Buffer {
  const pass = new PKPass(
    imagesDuPass(),
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
      // Le logo (logo.png) porte le nom : pas de logoText à côté.
      backgroundColor: COULEURS_PASS.fond.rgb,
      foregroundColor: COULEURS_PASS.texte,
      labelColor: COULEURS_PASS.libelle,
    }
  )

  pass.type = "boardingPass"
  pass.transitType = "PKTransitTypeTrain"
  pass.setBarcodes({
    // Aztec, comme le billet PDF et le billet du site.
    format: "PKBarcodeFormatAztec",
    message: data.barcode,
    messageEncoding: "iso-8859-1",
    altText: data.number,
  })
  pass.setRelevantDate(new Date(data.departureAt))
  pass.setExpirationDate(new Date(data.arrivalAt + 24 * 60 * 60_000))
  pass.primaryFields.push(
    {
      key: "origin",
      label: "Départ",
      value: data.origin.name,
    },
    {
      key: "destination",
      label: "Arrivée",
      value: data.destination.name,
    }
  )
  pass.secondaryFields.push(
    {
      key: "departure",
      label: "Départ",
      value: new Date(data.departureAt),
      dateStyle: "PKDateStyleMedium",
      timeStyle: "PKDateStyleShort",
    },
    {
      key: "train",
      label: "Train",
      value: nomTrain(data.trainType, data.trainNumber),
    }
  )
  pass.auxiliaryFields.push(
    {
      key: "passenger",
      label: "Voyageur",
      value: `${data.passenger.firstName} ${data.passenger.lastName}`,
    },
    {
      key: "class",
      label: "Classe",
      value: classeCourte(data.serviceClass),
    },
    {
      key: "seat",
      label: "Place",
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
