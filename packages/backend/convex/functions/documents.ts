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
import { PDFDocument } from "pdf-lib"

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
  handler: async (
    ctx,
    args
  ): Promise<
    TicketPrintData & {
      pdfStorageId?: Id<"_storage">
      departureAt: number
      arrivalAt: number
    }
  > => {
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Titre introuvable")

    const sale = await ctx.db.get(ticket.saleId)
    if (!sale) throw new Error("Vente introuvable")

    const user = await getUser(ctx)
    const estProprietaire = user !== null && sale.customerId === user._id
    const contactConcorde =
      args.contactPhone !== undefined && sale.contactPhone === args.contactPhone

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
        `Titre ${ticket.number} sans code-barres : impression impossible`
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
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
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

/**
 * Données de tous les titres d'un dossier, avec le même contrôle d'accès que
 * le téléchargement individuel. Cette query interne alimente le PDF groupé
 * et l'envoi par e-mail sans exposer les données d'impression au client.
 */
export const bookingPrintData = internalQuery({
  args: {
    reference: v.string(),
    contactPhone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    saleId: Id<"sales">
    customerId?: Id<"users">
    reference: string
    contactEmail?: string
    contactPhone?: string
    bundlePdfStorageId?: Id<"_storage">
    tickets: Array<TicketPrintData & { ticketId: Id<"tickets"> }>
  }> => {
    const sale = await ctx.db
      .query("sales")
      .withIndex("by_number", (q) => q.eq("number", args.reference))
      .unique()
    if (!sale) throw new Error("Réservation introuvable")

    const user = await getUser(ctx)
    const estProprietaire = user !== null && sale.customerId === user._id
    const contactConcorde =
      args.contactPhone !== undefined && sale.contactPhone === args.contactPhone
    if (!estProprietaire && !contactConcorde) {
      await requirePermission(ctx, "duplicatas", "consulter")
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    if (tickets.length === 0) throw new Error("Réservation sans titre")

    const printTickets = await Promise.all(
      tickets.map(async (ticket) => {
        const trip = await ctx.db.get(ticket.tripId)
        if (!trip) throw new Error("Desserte introuvable")
        const [origine, destination] = await Promise.all([
          ctx.db.get(ticket.originStationId),
          ctx.db.get(ticket.destinationStationId),
        ])
        if (!ticket.barcodePayload) {
          throw new Error(
            `Titre ${ticket.number} sans code-barres : impression impossible`
          )
        }
        return {
          ticketId: ticket._id,
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
        } satisfies TicketPrintData & { ticketId: Id<"tickets"> }
      })
    )

    return {
      saleId: sale._id,
      customerId: sale.customerId,
      reference: sale.number,
      contactEmail: sale.contactEmail,
      contactPhone: sale.contactPhone,
      bundlePdfStorageId: sale.bundlePdfStorageId,
      tickets: printTickets,
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

/** Rattache le PDF multi-billets au dossier et remplace l'ancienne version. */
export const attachBookingPdf = internalMutation({
  args: {
    saleId: v.id("sales"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const sale = await ctx.db.get(args.saleId)
    if (!sale) throw new Error("Vente introuvable")
    if (sale.bundlePdfStorageId && sale.bundlePdfStorageId !== args.storageId) {
      await ctx.storage.delete(sale.bundlePdfStorageId)
    }
    await ctx.db.patch(args.saleId, { bundlePdfStorageId: args.storageId })
  },
})

/** Assemble plusieurs billets A5 dans un unique PDF multi-pages. */
export async function renderBookingPdf(
  tickets: readonly TicketPrintData[]
): Promise<Uint8Array> {
  const bundle = await PDFDocument.create()
  for (const ticket of tickets) {
    const source = await PDFDocument.load(await renderTicketPdf(ticket))
    const pages = await bundle.copyPages(source, source.getPageIndices())
    for (const page of pages) bundle.addPage(page)
  }
  bundle.setTitle("Billets SETRAG")
  bundle.setProducer("SETRAG — billettique")
  bundle.setCreator("SETRAG")
  return await bundle.save()
}

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
  handler: async (
    ctx,
    args
  ): Promise<{ url: string; regenerated: boolean }> => {
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
      new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
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

/** Produit un document unique contenant tous les billets d'une réservation. */
export const bookingPdf = action({
  args: {
    reference: v.string(),
    contactPhone: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    url: string
    filename: string
    ticketCount: number
    regenerated: boolean
  }> => {
    const data = await ctx.runQuery(
      internal.functions.documents.bookingPrintData,
      {
        reference: args.reference,
        contactPhone: args.contactPhone,
      }
    )
    if (data.bundlePdfStorageId && args.force !== true) {
      const cached = await ctx.storage.getUrl(data.bundlePdfStorageId)
      if (cached) {
        return {
          url: cached,
          filename: `billets-${data.reference}.pdf`,
          ticketCount: data.tickets.length,
          regenerated: false,
        }
      }
    }

    const bytes = await renderBookingPdf(data.tickets)
    const storageId = await ctx.storage.store(
      new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
    )
    await ctx.runMutation(internal.functions.documents.attachBookingPdf, {
      saleId: data.saleId,
      storageId,
    })
    const url = await ctx.storage.getUrl(storageId)
    if (!url) throw new Error("Billets générés mais introuvables")
    return {
      url,
      filename: `billets-${data.reference}.pdf`,
      ticketCount: data.tickets.length,
      regenerated: true,
    }
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
      const sale = await ctx.db.get(ticket.saleId)
      if (sale?.bundlePdfStorageId) {
        await ctx.storage.delete(sale.bundlePdfStorageId)
        await ctx.db.patch(sale._id, { bundlePdfStorageId: undefined })
      }

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
