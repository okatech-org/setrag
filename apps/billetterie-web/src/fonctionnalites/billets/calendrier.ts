/**
 * Le voyage dans l'agenda du téléphone : un fichier .ics, fabriqué sur
 * l'appareil — il n'a besoin ni du serveur ni du réseau.
 *
 * Seuls les faits du dossier y figurent : train, gares, heures, référence.
 * Le rappel sonne la veille, à l'heure du départ.
 */

export type EvenementVoyage = {
  reference: string
  /** « Express 201 » */
  train: string
  origine: string
  destination: string
  departAt: number
  arriveeAt: number
  /** Nombre de billets du dossier. */
  billets: number
  /** Instant de fabrication du fichier (DTSTAMP). */
  maintenant: number
}

/** 20261002T064000Z */
function dateIcs(instant: number): string {
  return new Date(instant)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
}

/** Échappement des textes (RFC 5545, § 3.3.11). */
function texte(valeur: string): string {
  return valeur
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** Lignes de plus de 75 octets repliées, comme l'exige la norme. */
function replier(ligne: string): string {
  const octets = new TextEncoder()
  if (octets.encode(ligne).length <= 75) return ligne
  const morceaux: string[] = []
  let courant = ""
  for (const caractere of ligne) {
    if (
      octets.encode(courant + caractere).length >
      (morceaux.length === 0 ? 75 : 74)
    ) {
      morceaux.push(courant)
      courant = caractere
    } else {
      courant += caractere
    }
  }
  morceaux.push(courant)
  return morceaux.join("\r\n ")
}

export function creerCalendrier(voyage: EvenementVoyage): string {
  const billets = voyage.billets > 1 ? `${voyage.billets} billets` : "1 billet"
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SETRAG//Billetterie//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${texte(voyage.reference)}@billetterie.setrag`,
    `DTSTAMP:${dateIcs(voyage.maintenant)}`,
    `DTSTART:${dateIcs(voyage.departAt)}`,
    `DTEND:${dateIcs(voyage.arriveeAt)}`,
    `SUMMARY:${texte(`${voyage.train} · ${voyage.origine} → ${voyage.destination}`)}`,
    `LOCATION:${texte(`Gare ${voyage.origine}`)}`,
    `DESCRIPTION:${texte(`Réservation SETRAG ${voyage.reference} · ${billets}. Le code de chaque billet se présente au contrôle, même sans réseau.`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-P1D",
    `DESCRIPTION:${texte(`Demain : ${voyage.train} pour ${voyage.destination}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lignes.map(replier).join("\r\n") + "\r\n"
}
