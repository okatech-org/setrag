import { v } from "convex/values"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type QueryCtx,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  assertPermission,
  getUser,
  loadActor,
  requirePermission,
} from "../lib/auth"
import {
  CURRENT_KEY_VERSION,
  isUsingDemoKey,
  signTicket,
  verifyBarcode,
} from "../lib/signature"
import { PAYLOAD_VERSION, expiryFromArrival } from "../model/barcode"
import {
  MISE_EN_PAGE_DU,
  renderTicketPdf,
  renderTicketsPdf,
  type TicketPrintData,
} from "../lib/ticketPdf"
import { memeTelephone } from "../model/telephone"
import { horairesDuVoyageur } from "../lib/horaires"

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

/**
 * Heure locale au format 08:15, dans le fuseau du Gabon — l'écriture des
 * horaires de la billetterie (`formatTime`) et de la charte.
 */
function heureLocale(timestamp: number): string {
  // Africa/Libreville est à UTC+1 toute l'année, sans heure d'été : une
  // addition suffit, et évite de dépendre du support des fuseaux du runtime.
  const local = new Date(timestamp + 60 * 60 * 1000)
  const hh = String(local.getUTCHours()).padStart(2, "0")
  const mm = String(local.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Le PDF rangé, s'il porte la mise en page en vigueur. Un fichier fabriqué
 * avant `MISE_EN_PAGE_DU` est ignoré : l'action le refait, et `attachPdf`
 * efface l'ancien. Pas de migration à lancer, pas de champ à ajouter.
 */
async function pdfAJour(
  ctx: QueryCtx,
  id: Id<"_storage"> | undefined
): Promise<Id<"_storage"> | undefined> {
  if (!id) return undefined
  const fichier = await ctx.db.system.get(id)
  return fichier && fichier._creationTime >= MISE_EN_PAGE_DU ? id : undefined
}

type TicketPrintPayload = TicketPrintData & {
  pdfStorageId?: Id<"_storage">
  departureAt: number
  arrivalAt: number
}

/**
 * Rassemble les données d'impression et contrôle le droit d'y accéder.
 *
 * Trois portes d'entrée, dans l'ordre de confiance décroissante : un agent
 * habilité aux duplicatas, le client authentifié propriétaire de la vente,
 * ou — pour l'achat sans compte — la référence de vente doublée du téléphone
 * de contact. La référence seule ne suffit jamais.
 *
 * `user` est l'appelant déjà résolu : le jeton de session pour `printData`,
 * l'acteur d'une conversation d'assistant pour `printDataForActor`.
 */
async function loadPrintData(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  args: { ticketId: Id<"tickets">; contactPhone?: string },
  options: { permissionsInternes: boolean } = { permissionsInternes: true }
): Promise<TicketPrintPayload> {
  const ticket = await ctx.db.get(args.ticketId)
  if (!ticket) throw new Error("Titre introuvable")

  const sale = await ctx.db.get(ticket.saleId)
  if (!sale) throw new Error("Vente introuvable")

  const estProprietaire = user !== null && sale.customerId === user._id
  const contactConcorde =
    memeTelephone(sale.contactPhone, args.contactPhone)

  if (!estProprietaire && !contactConcorde) {
    // Un acteur venu d'une messagerie n'est jamais un agent : pas de repli
    // sur le droit aux duplicatas, le contrôle reste celui du voyageur.
    if (!options.permissionsInternes) throw new Error("Titre introuvable")
    // Peut lever : c'est bien le comportement voulu pour un tiers.
    assertPermission(user, "duplicatas", "consulter")
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

  const horaires = await horairesDuVoyageur(ctx.db, trip, ticket)

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
    departureLabel: heureLocale(horaires.departureAt),
    arrivalLabel: heureLocale(horaires.arrivalAt),
    departureAt: horaires.departureAt,
    arrivalAt: horaires.arrivalAt,
    trainNumber: trip.trainNumber,
    trainType: trip.trainType,
    serviceClass: ticket.serviceClass,
    coachLabel: ticket.coachLabel,
    seatLabel: ticket.seatLabel,
    priceTtc: ticket.unitPriceTtc,
    saleNumber: sale.number,
    status: ticket.status,
    isDemoKey: isUsingDemoKey(),
    pdfStorageId: await pdfAJour(ctx, ticket.pdfStorageId),
  }
}

const printDataArgs = {
  ticketId: v.id("tickets"),
  contactPhone: v.optional(v.string()),
}

export const printData = internalQuery({
  args: printDataArgs,
  handler: async (ctx, args): Promise<TicketPrintPayload> =>
    await loadPrintData(ctx, await getUser(ctx), args),
})

/** Voie par laquelle l'acteur de l'assistant a été établi. */
const actorSource = v.optional(
  v.union(v.literal("session"), v.literal("messaging"))
)

/**
 * Même contrôle que `printData`, pour un acteur résolu par le serveur. Venu
 * d'une messagerie (`source: "messaging"`), l'acteur n'a droit qu'aux billets
 * de ses propres ventes — ou à ceux dont il donne le téléphone de contact,
 * comme tout invité — jamais aux droits internes de son rôle.
 */
export const printDataForActor = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    source: actorSource,
    ...printDataArgs,
  },
  handler: async (
    ctx,
    { userId, source, ...args }
  ): Promise<TicketPrintPayload> =>
    await loadPrintData(ctx, await loadActor(ctx, userId), args, {
      permissionsInternes: source !== "messaging",
    }),
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
      memeTelephone(sale.contactPhone, args.contactPhone)
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
        const horaires = await horairesDuVoyageur(ctx.db, trip, ticket)
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
          departureLabel: heureLocale(horaires.departureAt),
          arrivalLabel: heureLocale(horaires.arrivalAt),
          trainNumber: trip.trainNumber,
          trainType: trip.trainType,
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
      bundlePdfStorageId: await pdfAJour(ctx, sale.bundlePdfStorageId),
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

/**
 * Tous les billets d'un dossier dans un unique PDF, une page A5 chacun. Les
 * polices y sont embarquées une seule fois pour toutes les pages.
 */
export async function renderBookingPdf(
  tickets: readonly TicketPrintData[]
): Promise<Uint8Array> {
  return await renderTicketsPdf(tickets, "Billets SETRAG")
}

/**
 * Produit — ou retrouve — le billet imprimable et rend son adresse.
 *
 * Idempotent par défaut : un billet déjà généré est simplement resservi.
 * `force` permet de le refabriquer, ce dont on a besoin après un changement
 * de place ou une correction d'identité.
 */
async function serveTicketPdf(
  ctx: ActionCtx,
  ticketId: Id<"tickets">,
  data: TicketPrintPayload,
  force: boolean | undefined
): Promise<{ url: string; regenerated: boolean }> {
  if (data.pdfStorageId && force !== true) {
    const url = await ctx.storage.getUrl(data.pdfStorageId)
    if (url) return { url, regenerated: false }
    // Fichier disparu du stockage : on repart sur une génération.
  }

  const bytes = await renderTicketPdf(data)
  const storageId = await ctx.storage.store(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
  )

  await ctx.runMutation(internal.functions.documents.attachPdf, {
    ticketId,
    storageId,
  })

  const url = await ctx.storage.getUrl(storageId)
  if (!url) throw new Error("Billet généré mais introuvable dans le stockage")
  return { url, regenerated: true }
}

const ticketPdfArgs = {
  ticketId: v.id("tickets"),
  contactPhone: v.optional(v.string()),
  force: v.optional(v.boolean()),
}

export const ticketPdf = action({
  args: ticketPdfArgs,
  handler: async (
    ctx,
    args
  ): Promise<{ url: string; regenerated: boolean }> => {
    const data = await ctx.runQuery(internal.functions.documents.printData, {
      ticketId: args.ticketId,
      contactPhone: args.contactPhone,
    })
    return await serveTicketPdf(ctx, args.ticketId, data, args.force)
  },
})

/**
 * Variante interne de `ticketPdf` : le droit d'accès est évalué pour l'acteur
 * résolu par l'assistant, pas pour le jeton de l'appel.
 */
export const ticketPdfForActor = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    source: actorSource,
    ...ticketPdfArgs,
  },
  handler: async (
    ctx,
    args
  ): Promise<{ url: string; regenerated: boolean }> => {
    const data = await ctx.runQuery(
      internal.functions.documents.printDataForActor,
      {
        userId: args.userId,
        source: args.source,
        ticketId: args.ticketId,
        contactPhone: args.contactPhone,
      }
    )
    return await serveTicketPdf(ctx, args.ticketId, data, args.force)
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
      memeTelephone(sale?.contactPhone, args.contactPhone)
    if (!autorise) await requirePermission(ctx, "duplicatas", "consulter")

    const pdf = await pdfAJour(ctx, ticket.pdfStorageId)
    if (!pdf) return null
    return await ctx.storage.getUrl(pdf)
  },
})
