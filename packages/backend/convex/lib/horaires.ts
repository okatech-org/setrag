import type { Doc } from "../_generated/dataModel"
import type { DatabaseReader } from "../_generated/server"

/**
 * Les heures du voyageur — sa montée, sa descente —, et non celles du train
 * d'un terminus à l'autre : on monte à Ndjolé à 11:20, pas à Owendo à 08:00.
 *
 * Les arrêts se retrouvent par leur rang (`fromStopIndex`, `toStopIndex`),
 * l'indice même des masques d'inventaire. Un arrêt sans horaire retombe sur
 * l'heure du train, plutôt que de laisser un billet sans heure.
 */
export async function horairesDuVoyageur(
  db: DatabaseReader,
  trip: Doc<"trips">,
  titre: Pick<Doc<"tickets">, "fromStopIndex" | "toStopIndex">
): Promise<{ departureAt: number; arrivalAt: number }> {
  const arret = (sequence: number) =>
    db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) =>
        q.eq("tripId", trip._id).eq("sequence", sequence)
      )
      .first()
  const [montee, descente] = await Promise.all([
    arret(titre.fromStopIndex),
    arret(titre.toStopIndex),
  ])
  return {
    departureAt: montee?.departureAt ?? montee?.arrivalAt ?? trip.departureAt,
    arrivalAt: descente?.arrivalAt ?? descente?.departureAt ?? trip.arrivalAt,
  }
}
