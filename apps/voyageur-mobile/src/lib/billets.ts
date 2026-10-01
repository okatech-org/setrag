import type { TonPastille } from "@/components/elements"

import type { Booking } from "./bookings-cache"
import { classeCourte, type Classe } from "./voyage"

export type BilletDuDossier = Booking["tickets"][number]

/** Pastille d'un billet : son état, en un mot. */
export function statutBillet(statut: string): { libelle: string; ton: TonPastille } {
  switch (statut) {
    case "valide":
      return { libelle: "Valide", ton: "ok" }
    case "utilise":
      return { libelle: "Utilisé", ton: "neutre" }
    case "rembourse":
      return { libelle: "Remboursé", ton: "neutre" }
    case "annule":
      return { libelle: "Annulé", ton: "annule" }
    case "expire":
      return { libelle: "Expiré", ton: "neutre" }
    default:
      return { libelle: "Non payé", ton: "retard" }
  }
}

/** Le billet se présente au contrôle : il porte un code signé et n'est ni annulé ni remboursé. */
export const billetPresentable = (billet: BilletDuDossier) => Boolean(billet.barcodePayload) && (billet.status === "valide" || billet.status === "utilise")

/** « 32-33 » quand les places se suivent dans la même voiture, sinon « 32, 35 ». */
function places(billets: BilletDuDossier[]) {
  const libelles = billets.map((billet) => billet.seatLabel).filter((libelle): libelle is string => Boolean(libelle))
  if (libelles.length === 0) return "—"
  const nombres = libelles.map(Number)
  const suite = nombres.every((n) => Number.isInteger(n)) && nombres.every((n, index) => index === 0 || n === nombres[index - 1]! + 1)
  return suite && libelles.length > 1 ? `${libelles[0]}-${libelles.at(-1)}` : libelles.join(", ")
}

/** Cases du billet : voiture, place(s), classe. Le quai n'est pas encore publié. */
export function casesBillet(billets: BilletDuDossier[]) {
  const voitures = [...new Set(billets.map((billet) => billet.coachLabel).filter(Boolean))]
  const debout = billets.every((billet) => billet.isStanding)
  return [
    { libelle: "Voiture", valeur: voitures.length ? voitures.join(", ") : "—" },
    { libelle: billets.length > 1 ? "Places" : "Place", valeur: debout ? "Debout" : places(billets) },
    { libelle: "Classe", valeur: classeCourte(billets[0]!.serviceClass as Classe) },
  ]
}

/** « voiture 4, place 32 » — sous le nom du voyageur, sur le billet réduit. */
export function placeEnClair(billet: BilletDuDossier) {
  if (billet.isStanding) return "debout"
  return [billet.coachLabel && `voiture ${billet.coachLabel}`, billet.seatLabel && `place ${billet.seatLabel}`].filter(Boolean).join(", ") || "place attribuée à bord"
}
