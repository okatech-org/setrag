/**
 * Cartes de wallet — Apple Wallet et Google Wallet.
 *
 * Le pass lui-même est émis côté serveur : Apple exige un `.pkpass` signé avec
 * un certificat Pass Type ID, Google un objet créé via l'API Wallet. Ce module
 * ne fait que la partie déterministe et partageable : passer d'un billet SETRAG
 * à la structure attendue par chaque plateforme.
 *
 * Les deux plateformes plafonnent le nombre de champs. Les dépasser tronque
 * silencieusement l'affichage côté téléphone, d'où les découpages ci-dessous.
 */

import { formatTime, formatXaf } from "./utils/format"

/** Couleurs de marque, en `rgb()` — le seul format accepté par `pass.json`. */
export const WALLET_COLORS = {
  /** Bleu SETRAG #0F52A0. */
  background: "rgb(15, 80, 160)",
  foreground: "rgb(255, 255, 255)",
  label: "rgb(198, 217, 240)",
} as const

export interface WalletTicketInput {
  reference: string
  passengerName: string
  originName: string
  originCode: string
  destinationName: string
  destinationCode: string
  departureAt: number
  arrivalAt: number
  trainNumber: string
  serviceClass: string
  coach?: string
  seat?: string
  platform?: string
  priceXaf: number
  /** Charge utile du QR — celle que scanne le contrôleur. */
  qrPayload: string
  /** Coordonnées des gares : Apple remonte le pass à proximité. */
  locations?: Array<{ latitude: number; longitude: number; relevantText?: string }>
}

/**
 * `pass.json` d'un billet — type `boardingPass`, transport ferroviaire.
 *
 * À compléter côté serveur par `logo.png`, `icon.png` (et leurs @2x), puis à
 * signer. Le `serialNumber` est la référence du billet : réémettre le même
 * numéro mettra à jour le pass déjà installé au lieu d'en créer un second.
 */
export function buildApplePass(
  ticket: WalletTicketInput,
  { passTypeIdentifier, teamIdentifier, webServiceURL, authenticationToken }: {
    passTypeIdentifier: string
    teamIdentifier: string
    webServiceURL?: string
    authenticationToken?: string
  }
) {
  return {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: ticket.reference,
    organizationName: "SETRAG",
    description: `Billet ${ticket.originName} → ${ticket.destinationName}`,
    logoText: "SETRAG",
    backgroundColor: WALLET_COLORS.background,
    foregroundColor: WALLET_COLORS.foreground,
    labelColor: WALLET_COLORS.label,
    /* Fait remonter le pass sur l'écran verrouillé à l'approche du départ. */
    relevantDate: new Date(ticket.departureAt).toISOString(),
    ...(webServiceURL && authenticationToken
      ? { webServiceURL, authenticationToken }
      : {}),
    ...(ticket.locations?.length ? { locations: ticket.locations } : {}),
    boardingPass: {
      transitType: "PKTransitTypeTrain",
      headerFields: [
        {
          key: "train",
          label: "Train",
          value: ticket.trainNumber,
        },
      ],
      /* Un boardingPass affiche exactement deux champs principaux. */
      primaryFields: [
        { key: "origin", label: "Départ", value: ticket.originCode },
        { key: "destination", label: "Arrivée", value: ticket.destinationCode },
      ],
      secondaryFields: [
        {
          key: "departureTime",
          label: "Départ",
          value: formatTime(ticket.departureAt),
        },
        {
          key: "arrivalTime",
          label: "Arrivée",
          value: formatTime(ticket.arrivalAt),
        },
        { key: "class", label: "Classe", value: ticket.serviceClass },
      ].slice(0, 4),
      auxiliaryFields: [
        ...(ticket.coach
          ? [{ key: "coach", label: "Voiture", value: ticket.coach }]
          : []),
        ...(ticket.seat
          ? [{ key: "seat", label: "Place", value: ticket.seat }]
          : []),
        ...(ticket.platform
          ? [{ key: "platform", label: "Quai", value: ticket.platform }]
          : []),
        { key: "passenger", label: "Voyageur", value: ticket.passengerName },
      ].slice(0, 5),
      backFields: [
        { key: "reference", label: "Dossier", value: ticket.reference },
        { key: "price", label: "Prix payé", value: formatXaf(ticket.priceXaf) },
        {
          key: "route",
          label: "Trajet",
          value: `${ticket.originName} → ${ticket.destinationName}`,
        },
        {
          key: "conditions",
          label: "Conditions",
          value:
            "Billet nominatif, non cessible. Échange possible jusqu'à 30 min avant le départ. Présentez ce billet et une pièce d'identité au contrôle.",
        },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: ticket.qrPayload,
        messageEncoding: "iso-8859-1",
        altText: ticket.reference,
      },
    ],
  }
}

/**
 * `TransitObject` Google Wallet. La `TransitClass` correspondante (émetteur,
 * logo, couleur) se crée une fois pour toutes, pas par billet.
 */
export function buildGoogleWalletObject(
  ticket: WalletTicketInput,
  { issuerId, classSuffix }: { issuerId: string; classSuffix: string }
) {
  return {
    id: `${issuerId}.${ticket.reference}`,
    classId: `${issuerId}.${classSuffix}`,
    state: "ACTIVE",
    hexBackgroundColor: "#0F50A0",
    tripType: "ONE_WAY",
    ticketNumber: ticket.reference,
    passengerNames: ticket.passengerName,
    barcode: {
      type: "QR_CODE",
      value: ticket.qrPayload,
      alternateText: ticket.reference,
    },
    ticketLeg: {
      originStationCode: ticket.originCode,
      originName: { defaultValue: { language: "fr", value: ticket.originName } },
      destinationStationCode: ticket.destinationCode,
      destinationName: {
        defaultValue: { language: "fr", value: ticket.destinationName },
      },
      departureDateTime: new Date(ticket.departureAt).toISOString(),
      arrivalDateTime: new Date(ticket.arrivalAt).toISOString(),
      fareClass: ticket.serviceClass,
      carriage: ticket.coach,
      seat: ticket.seat,
      platform: ticket.platform,
      ticketSeat: ticket.seat
        ? { coach: ticket.coach, seat: ticket.seat }
        : undefined,
    },
  }
}

/** Champs de l'aperçu `WalletPass`, dérivés du même billet. */
export function toWalletPreview(ticket: WalletTicketInput) {
  return {
    headerFields: [{ label: "Train", value: ticket.trainNumber, mono: true }],
    origin: { label: "Départ", value: ticket.originCode },
    destination: { label: "Arrivée", value: ticket.destinationCode },
    secondaryFields: [
      { label: "Départ", value: formatTime(ticket.departureAt), mono: true },
      { label: "Arrivée", value: formatTime(ticket.arrivalAt), mono: true },
      { label: "Classe", value: ticket.serviceClass },
    ],
    auxiliaryFields: [
      ...(ticket.coach ? [{ label: "Voiture", value: ticket.coach, mono: true }] : []),
      ...(ticket.seat ? [{ label: "Place", value: ticket.seat, mono: true }] : []),
      ...(ticket.platform ? [{ label: "Quai", value: ticket.platform, mono: true }] : []),
    ],
    barcodeAltText: ticket.reference,
  }
}
