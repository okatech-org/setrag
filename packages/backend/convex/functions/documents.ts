import { v } from "convex/values"
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { getUser, requirePermission } from "../lib/auth"
import {
  CURRENT_KEY_VERSION,
  isUsingDemoKey,
  signTicket,
  verifyBarcode,
} from "../lib/signature"
import { PAYLOAD_VERSION, expiryFromArrival } from "../model/barcode"
import { renderTicketPdf, type TicketPrintData } from "../lib/ticketPdf"

/**
 * Documents imprimables — billets au format PDF.
 *
 * La génération est une ACTION, pas une mutation : elle produit un fichier de
 * plusieurs dizaines de kilo-octets et n'a rien à faire dans une transaction
 * de vente, dont elle allongerait la fenêtre de conflit sans nécessité. Le
 * billet est donc fabriqué à la demande, puis conservé.
 *
 * Le PDF n'est pas le titre : le titre, c'est la ligne en base et son
 * code-barres signé. Le PDF n'en est qu'une représentation, régénérable à
 * l'identique — c'est ce qui permet de le mettre en cache sans risque.
 */

/** Heure locale au format 08h15, dans le fuseau du Gabon. */
function heureLocale(timestamp: number): string {
  // Africa/Libreville est à UTC+1 toute l'année, sans heure d'été : une
  // addition suffit, et évite de dépendre du support des fuseaux du runtime.
  const local = new Date(timestamp + 60 * 60 * 1000)
  const hh = String(local.getUTCHours()).padStart(2, "0")
  const mm = String(local.getUTCMinutes()).padStart(2, "0")
  return `${hh}h${mm}`
}

/**
 * Rassemble les données d'impression et contrôle le droit d'y accéder.
 *
 * Trois portes d'entrée, dans l'ordre de confiance décroissante : un agent
 * habilité aux duplicatas, le client authentifié propriétaire de la vente,
 * ou — pour l'achat sans compte — la référence de vente doublée du téléphone
 * de contact. La référence seule ne suffit jamais.
 */
export const printData = internalQuery({
  args: {
    ticketId: v.id("tickets"),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TicketPrintData & {
    pdfStorageId?: Id<"_storage">
  }> => {
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Titre introuvable")

    const sale = await ctx.db.get(ticket.saleId)
    if (!sale) throw new Error("Vente introuvable")

    const user = await getUser(ctx)
    const estProprietaire = user !== null && sale.customerId === user._id
    const contactConcorde =
      args.contactPhone !== undefined &&
      sale.contactPhone === args.contactPhone

    if (!estProprietaire && !contactConcorde) {
      // Peut lever : c'est bien le comportement voulu pour un tiers.
      await requirePermission(ctx, "duplicatas", "consulter")
    }

    const trip = await ctx.db.get(ticket.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const [origine, destination] = await Promise.all([
      ctx.db.get(ticket.originStationId),
      ctx.db.get(ticket.destinationStationId),
    ])

    if (!ticket.barcodePayload) {
      throw new Error(
        `Titre ${ticket.number} sans code-barres : impression impossible`,
      )
    }

    return {
      number: ticket.number,
      barcode: ticket.barcodePayload,
      passenger: {
        lastName: ticket.passenger.lastName,
        firstName: ticket.passenger.firstName,
      },
      origin: {
        code: origine?.code ?? "?",
        name: origine?.name ?? "Gare inconnue",
      },
      destination: {
        code: destination?.code ?? "?",
        name: destination?.name ?? "Gare inconnue",
      },
      serviceDate: trip.serviceDate,
      departureLabel: heureLocale(trip.departureAt),
      arrivalLabel: heureLocale(trip.arrivalAt),
      trainNumber: trip.trainNumber,
      serviceClass: ticket.serviceClass,
      coachLabel: ticket.coachLabel,
      seatLabel: ticket.seatLabel,
      priceTtc: ticket.unitPriceTtc,
      saleNumber: sale.number,
      status: ticket.status,
      isDemoKey: isUsingDemoKey(),
      pdfStorageId: ticket.pdfStorageId,
    }
  },
})

/** Rattache le fichier produit au titre. */
export const attachPdf = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Titre introuvable")

    // Un billet régénéré remplace le précédent : on efface l'ancien fichier
    // plutôt que de laisser s'accumuler des orphelins dans le stockage.
    if (ticket.pdfStorageId && ticket.pdfStorageId !== args.storageId) {
      await ctx.storage.delete(ticket.pdfStorageId)
    }
    await ctx.db.patch(args.ticketId, { pdfStorageId: args.storageId })
  },
})

/**
 * Produit — ou retrouve — le billet imprimable et rend son adresse.
 *
 * Idempotent par défaut : un billet déjà généré est simplement resservi.
 * `force` permet de le refabriquer, ce dont on a besoin après un changement
 * de place ou une correction d'identité.
 */
export const ticketPdf = action({
  args: {
    ticketId: v.id("tickets"),
    contactPhone: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ url: string; regenerated: boolean }> => {
    const data = await ctx.runQuery(internal.functions.documents.printData, {
      ticketId: args.ticketId,
      contactPhone: args.contactPhone,
    })

    if (data.pdfStorageId && args.force !== true) {
      const url = await ctx.storage.getUrl(data.pdfStorageId)
      if (url) return { url, regenerated: false }
      // Fichier disparu du stockage : on repart sur une génération.
    }

    const bytes = await renderTicketPdf(data)
    const storageId = await ctx.storage.store(
      new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    )

    await ctx.runMutation(internal.functions.documents.attachPdf, {
      ticketId: args.ticketId,
      storageId,
    })

    const url = await ctx.storage.getUrl(storageId)
    if (!url) throw new Error("Billet généré mais introuvable dans le stockage")
    return { url, regenerated: true }
  },
})

/**
 * Re-signe les titres dépourvus de code-barres ou portant une clé retirée.
 *
 * Deux usages : reprendre les titres antérieurs à la mise en service de la
 * signature, et rattraper une rotation de clé. Sans cela, un titre valable se
 * verrait refusé au contrôle pour un motif purement technique.
 *
 * Le traitement est borné et repris depuis l'endroit où il s'est arrêté : une
 * mutation Convex ne doit pas parcourir une table entière.
 */
export const resignTickets = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limite = Math.min(args.limit ?? 200, 500)
    let examines = 0
    let resignes = 0
    let ignores = 0

    for await (const ticket of ctx.db.query("tickets")) {
      if (resignes >= limite) break
      examines += 1

      // Critère : le titre se vérifie-t-il AUJOURD'HUI ? Comparer les
      // numéros de version ne suffirait pas — remplacer la clé sans changer
      // sa version laisserait passer des titres devenus invérifiables, et
      // c'est précisément le genre d'oubli qu'on ne veut pas confier à la
      // discipline. Vérifier coûte une signature par titre ; le lot est
      // borné pour que ce coût reste tenable.
      const àRefaire =
        ticket.barcodePayload === undefined ||
        !verifyBarcode(ticket.barcodePayload).authentic
      if (!àRefaire) continue

      const trip = await ctx.db.get(ticket.tripId)
      if (!trip) {
        ignores += 1
        continue
      }

      const signed = signTicket({
        v: PAYLOAD_VERSION,
        k: CURRENT_KEY_VERSION,
        kind: "billet",
        ref: ticket.number,
        trip: ticket.tripId,
        date: trip.serviceDate,
        cls: ticket.serviceClass,
        from: ticket.fromStopIndex,
        to: ticket.toStopIndex,
        seat: ticket.seatLabel,
        exp: expiryFromArrival(trip.arrivalAt),
      })

      // Le PDF porte l'ancien symbole : il devient faux, on le retire pour
      // qu'il soit refabriqué à la prochaine demande.
      if (ticket.pdfStorageId) await ctx.storage.delete(ticket.pdfStorageId)

      await ctx.db.patch(ticket._id, {
        barcodePayload: signed.barcode,
        barcodeSignature: signed.signatureHex,
        keyVersion: signed.keyVersion,
        pdfStorageId: undefined,
      })
      resignes += 1
    }

    return { examines, resignes, ignores }
  },
})

/** Adresse du billet déjà généré, sans le fabriquer. */
export const ticketPdfUrl = query({
  args: {
    ticketId: v.id("tickets"),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) return null

    const sale = await ctx.db.get(ticket.saleId)
    const user = await getUser(ctx)
    const autorise =
      (user !== null && sale?.customerId === user._id) ||
      (args.contactPhone !== undefined &&
        sale?.contactPhone === args.contactPhone)
    if (!autorise) await requirePermission(ctx, "duplicatas", "consulter")

    if (!ticket.pdfStorageId) return null
    return await ctx.storage.getUrl(ticket.pdfStorageId)
  },
})
