import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import type { Doc, TableNames } from "../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server"
import { release, segmentMask } from "../model/inventory"
import { CONTEXTE_AUDIT, CONTEXTE_MANIFESTE, PREFIXE, PREFIXE_AUTH, PREFIXE_FIN } from "./demoActivitePlan"

/**
 * Réinitialisation de l'activité de démonstration (`seeds/demoActivite`).
 *
 * Ne retire que ce que le seed a écrit :
 *  — les ventes, titres, règlements et produits annexes dont la clé
 *    d'idempotence commence par « demo-activite| » ;
 *  — les contrôles, procès-verbaux et incidents de même préfixe ;
 *  — les créations et modifications recensées dans le journal d'audit par
 *    le contexte `{"source":"demo-activite","manifeste":true}`, défaites de
 *    la plus récente à la plus ancienne ;
 *  — enfin, les entrées d'audit portant ce contexte.
 *
 * L'inventaire des dessertes conservées est rendu : une place vendue par le
 * seed redevient libre, un blocage posé par le seed est levé.
 */

type Ctx = MutationCtx

/* ═══════════════════════════════ Ventes ════════════════════════════════ */

/** Libère la place d'un titre encore opposable, comme `releaseTicketsInventory`. */
async function rendrePlace(ctx: Ctx, ticket: Doc<"tickets">) {
  if (ticket.status !== "valide" && ticket.status !== "utilise") return
  const trip = await ctx.db.get(ticket.tripId)
  if (!trip) return
  const masque = segmentMask({ fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex }, trip.segmentCount)
  if (ticket.seatId) {
    const occupation = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_seat", (q) => q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!))
      .unique()
    if (occupation) await ctx.db.patch(occupation._id, { soldMask: release(occupation.soldMask, masque) })
  }
  const counters = await ctx.db
    .query("segmentCounters")
    .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass))
    .collect()
  for (const c of counters) {
    if (c.segmentIndex < ticket.fromStopIndex || c.segmentIndex >= ticket.toStopIndex) continue
    const sold = Math.max(0, c.sold - 1)
    await ctx.db.patch(c._id, { sold, available: Math.min(c.capacity, c.capacity - sold - c.held - c.reserved) })
  }
  const quota = (
    await ctx.db
      .query("fareClassQuotas")
      .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass))
      .collect()
  )
    .filter((q) => q.soldCount > 0)
    .sort((a, b) => b.priority - a.priority)[0]
  if (quota) await ctx.db.patch(quota._id, { soldCount: quota.soldCount - 1 })
}

/** Préfixe de numérotation (`V-OWE-PV-20260915-`) d'un numéro de pièce. */
function prefixeNumero(numero: string): string {
  return numero.slice(0, numero.lastIndexOf("-") + 1)
}

export const supprimerVentes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ventes = await ctx.db
      .query("sales")
      .withIndex("by_client_id", (q) => q.gte("clientSaleId", PREFIXE).lt("clientSaleId", PREFIXE_FIN))
      .take(40)
    const numeros = new Set<string>()
    const dates = new Set<string>()
    for (const sale of ventes) {
      numeros.add(prefixeNumero(sale.number))
      for (const ticket of await ctx.db.query("tickets").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        numeros.add(prefixeNumero(ticket.number))
        await rendrePlace(ctx, ticket)
        await ctx.db.delete(ticket._id)
      }
      for (const p of await ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        await ctx.db.delete(p._id)
      }
      for (const b of await ctx.db.query("baggages").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        numeros.add(prefixeNumero(b.tagNumber))
        await ctx.db.delete(b._id)
      }
      for (const colis of await ctx.db.query("parcels").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        numeros.add(prefixeNumero(colis.shipmentNumber))
        for (const item of await ctx.db.query("parcelItems").withIndex("by_parcel", (q) => q.eq("parcelId", colis._id)).collect()) {
          numeros.add(prefixeNumero(item.stickerNumber))
          await ctx.db.delete(item._id)
        }
        await ctx.db.delete(colis._id)
      }
      for (const x of await ctx.db.query("vehicleTransports").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        numeros.add(prefixeNumero(x.shipmentNumber))
        await ctx.db.delete(x._id)
      }
      for (const x of await ctx.db.query("funeralTransports").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()) {
        numeros.add(prefixeNumero(x.shipmentNumber))
        await ctx.db.delete(x._id)
      }
      if (sale.accountingDayId) {
        const jour = await ctx.db.get(sale.accountingDayId)
        if (jour) dates.add(jour.date)
      }
      await ctx.db.delete(sale._id)
    }
    return { supprimees: ventes.length, termine: ventes.length < 40, numeros: [...numeros], dates: [...dates] }
  },
})

export const supprimerTerrain = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0
    for (const scan of await ctx.db
      .query("ticketScans")
      .withIndex("by_client_id", (q) => q.gte("clientScanId", PREFIXE).lt("clientScanId", PREFIXE_FIN))
      .take(400)) {
      await ctx.db.delete(scan._id)
      n += 1
    }
    for (const pv of await ctx.db
      .query("procesVerbaux")
      .withIndex("by_client_id", (q) => q.gte("clientId", PREFIXE).lt("clientId", PREFIXE_FIN))
      .take(100)) {
      for (const p of await ctx.db.query("payments").withIndex("by_penalty", (q) => q.eq("penaltyId", pv._id)).collect()) {
        await ctx.db.delete(p._id)
      }
      await ctx.db.delete(pv._id)
      n += 1
    }
    for (const incident of await ctx.db
      .query("incidents")
      .withIndex("by_client_id", (q) => q.gte("clientId", PREFIXE).lt("clientId", PREFIXE_FIN))
      .take(100)) {
      await ctx.db.delete(incident._id)
      n += 1
    }
    return { supprimes: n, termine: n === 0 }
  },
})

/* ═════════════════════════════ Manifeste ═══════════════════════════════ */

/** Entrées d'audit recensant une création ou une modification du seed. */
export const manifeste = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .filter((q) => q.eq(q.field("context"), CONTEXTE_MANIFESTE))
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((l) => ({
        action: l.action,
        table: l.entityTable,
        id: l.entityId,
        avant: l.before,
        a: l.createdAt,
      })),
    }
  },
})

const entreeManifeste = v.object({
  action: v.string(),
  table: v.string(),
  id: v.string(),
  avant: v.optional(v.string()),
  a: v.number(),
})

async function lire<T extends TableNames>(ctx: Ctx, table: T, id: string): Promise<Doc<T> | null> {
  const normalise = ctx.db.normalizeId(table, id)
  return normalise ? await ctx.db.get(normalise) : null
}

/** Défait une création ou une modification ; renvoie `false` s'il reste du travail. */
async function defaire(ctx: Ctx, e: { action: string; table: string; id: string; avant?: string }): Promise<boolean> {
  const avant = e.avant ? (JSON.parse(e.avant) as Record<string, unknown>) : {}
  switch (e.table) {
    case "users": {
      const user = await lire(ctx, "users", e.id)
      if (!user) return true
      if (user.authId.startsWith(PREFIXE_AUTH)) await ctx.db.delete(user._id)
      else if ("pointOfSaleId" in avant) await ctx.db.patch(user._id, { pointOfSaleId: undefined })
      return true
    }
    case "reportRuns": {
      const run = await lire(ctx, "reportRuns", e.id)
      if (!run) return true
      await supprimerExecution(ctx, run)
      return true
    }
    case "pointsOfSale":
    case "corporateAccounts":
    case "systemSettings":
    case "pricingRules":
    case "agencyQuotas": {
      const doc = await lire(ctx, e.table as "pointsOfSale", e.id)
      if (doc) await ctx.db.delete(doc._id)
      return true
    }
    case "reportSchedules": {
      const programme = await lire(ctx, "reportSchedules", e.id)
      if (!programme) return true
      for (const r of await ctx.db.query("reportRuns").withIndex("by_schedule", (q) => q.eq("scheduleId", programme._id)).collect()) {
        await supprimerExecution(ctx, r)
      }
      await ctx.db.delete(programme._id)
      return true
    }
    case "fareSchedules": {
      const grille = await lire(ctx, "fareSchedules", e.id)
      if (!grille) return true
      for (const b of await ctx.db.query("fareBases").withIndex("by_schedule", (q) => q.eq("scheduleId", grille._id)).collect()) {
        await ctx.db.delete(b._id)
      }
      for (const d of await ctx.db.query("discounts").withIndex("by_schedule", (q) => q.eq("scheduleId", grille._id)).collect()) {
        await ctx.db.delete(d._id)
      }
      await ctx.db.delete(grille._id)
      return true
    }
    case "timetableBooklets": {
      const livret = await lire(ctx, "timetableBooklets", e.id)
      if (!livret) return true
      // Les dessertes du livret échu, une par passage : chacune porte plusieurs
      // centaines de documents d'inventaire.
      const trip = await ctx.db.query("trips").withIndex("by_booklet", (q) => q.eq("bookletId", livret._id)).first()
      if (trip) {
        await supprimerDesserte(ctx, trip)
        return false
      }
      for (const h of await ctx.db.query("bookletSchedules").withIndex("by_booklet", (q) => q.eq("bookletId", livret._id)).collect()) {
        await ctx.db.delete(h._id)
      }
      await ctx.db.delete(livret._id)
      return true
    }
    case "seatBlocks": {
      const bloc = await lire(ctx, "seatBlocks", e.id)
      if (!bloc) return true
      if (bloc.isActive) {
        const occupation = await ctx.db
          .query("seatOccupancy")
          .withIndex("by_trip_seat", (q) => q.eq("tripId", bloc.tripId).eq("seatId", bloc.seatId))
          .unique()
        if (occupation) {
          await ctx.db.patch(occupation._id, { blockedMask: occupation.blockedMask & ~bloc.mask })
          for (const c of await ctx.db
            .query("segmentCounters")
            .withIndex("by_trip_class", (q) => q.eq("tripId", bloc.tripId).eq("serviceClass", occupation.serviceClass))
            .collect()) {
            if ((bloc.mask & (1 << c.segmentIndex)) === 0) continue
            const reserved = Math.max(0, c.reserved - 1)
            await ctx.db.patch(c._id, { reserved, available: c.capacity - c.sold - c.held - reserved })
          }
        }
      }
      await ctx.db.delete(bloc._id)
      return true
    }
    case "cashSessions": {
      const session = await lire(ctx, "cashSessions", e.id)
      if (!session) return true
      if (e.action === "caisse.ouvrir") {
        await ctx.db.delete(session._id)
      } else if (e.action === "caisse.viser") {
        await ctx.db.patch(session._id, {
          status: "cloturee",
          validatedBy: undefined,
          validatedAt: undefined,
          visaComment: undefined,
        })
      } else if (avant.status === "ouverte") {
        await ctx.db.patch(session._id, {
          status: "ouverte",
          closedAt: undefined,
          expectedByMethod: Array.isArray(avant.expectedByMethod)
            ? (avant.expectedByMethod as Doc<"cashSessions">["expectedByMethod"])
            : session.expectedByMethod,
          countedByMethod: undefined,
          varianceXaf: undefined,
          varianceReason: undefined,
        })
      }
      return true
    }
    case "accountingDays": {
      const jour = await lire(ctx, "accountingDays", e.id)
      if (!jour) return true
      await supprimerJournal(ctx, jour)
      const restantes = await ctx.db.query("sales").withIndex("by_accounting_day", (q) => q.eq("accountingDayId", jour._id)).collect()
      const sessions = await ctx.db.query("cashSessions").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).first()
      if (e.action === "journee.ouvrir" && restantes.length === 0 && !sessions) {
        for (const m of await ctx.db.query("dailyMetrics").withIndex("by_date", (q) => q.eq("date", jour.date)).collect()) {
          await ctx.db.delete(m._id)
        }
        await ctx.db.delete(jour._id)
        return true
      }
      await ctx.db.patch(jour._id, {
        status: e.action === "journee.cloturer" ? "ouverte" : jour.status,
        closedAt: e.action === "journee.cloturer" ? undefined : jour.closedAt,
        closedBy: e.action === "journee.cloturer" ? undefined : jour.closedBy,
        exportStatus: e.action === "journee.cloturer" ? undefined : jour.exportStatus,
        totalTtc: Math.round(restantes.reduce((s, x) => s + x.amounts.ttc, 0) * 100) / 100,
        totalReceived: Math.round(restantes.reduce((s, x) => s + x.amounts.received, 0) * 100) / 100,
      })
      return true
    }
    case "trips": {
      const trip = await lire(ctx, "trips", e.id)
      if (trip) {
        await ctx.db.patch(trip._id, {
          status: avant.status as Doc<"trips">["status"],
          delayMinutes: avant.delayMinutes as number,
          isOpenForSale: avant.isOpenForSale as boolean,
        })
      }
      return true
    }
    default:
      return true
  }
}

/** Une exécution de rapport, son fichier et sa notification d'envoi. */
async function supprimerExecution(ctx: Ctx, run: Doc<"reportRuns">) {
  if (run.storageId) await ctx.storage.delete(run.storageId)
  if (run.delivery?.outboxEventId) {
    const evenement = await ctx.db.get(run.delivery.outboxEventId)
    if (evenement) await ctx.db.delete(evenement._id)
  }
  await ctx.db.delete(run._id)
}

async function supprimerJournal(ctx: Ctx, jour: Doc<"accountingDays">) {
  for (const e of await ctx.db.query("journalEntries").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()) {
    await ctx.db.delete(e._id)
  }
  for (const t of await ctx.db.query("sageTransmissions").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()) {
    await ctx.db.delete(t._id)
  }
  for (const ev of await ctx.db.query("outboxEvents").withIndex("by_type_status", (q) => q.eq("type", "sage_export")).collect()) {
    if (ev.entityId === jour._id) await ctx.db.delete(ev._id)
  }
  await ctx.db.patch(jour._id, {
    journalEntryCount: undefined,
    journalTotalTtc: undefined,
    journalRefundsTtc: undefined,
    journalGeneratedAt: undefined,
    exportError: undefined,
  })
}

async function supprimerDesserte(ctx: Ctx, trip: Doc<"trips">) {
  const tripId = trip._id
  const lignes = [
    ...(await ctx.db.query("tripStops").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("seatOccupancy").withIndex("by_trip_class", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("segmentCounters").withIndex("by_trip_class", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("fareClassQuotas").withIndex("by_trip_class", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("tripMetrics").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("seatBlocks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()),
    ...(await ctx.db.query("agencyQuotas").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()),
  ]
  for (const ligne of lignes) await ctx.db.delete(ligne._id)
  await ctx.db.delete(tripId)
}

export const defaireLot = internalMutation({
  args: { entrees: v.array(entreeManifeste) },
  handler: async (ctx, args) => {
    const restantes: typeof args.entrees = []
    for (const [i, e] of args.entrees.entries()) {
      const fini = await defaire(ctx, e)
      if (!fini) {
        // Travail restant (dessertes d'un livret) : on s'arrête là pour
        // rester dans le budget de la transaction.
        restantes.push(...args.entrees.slice(i))
        break
      }
    }
    return { restantes }
  },
})

/* ═══════════════════════════ Totaux des journées ═══════════════════════ */

/**
 * Totaux des journées où le seed a vendu, recalculés sur les ventes qui
 * restent — y compris sur une journée ouverte par quelqu'un d'autre.
 */
export const recalerJournees = internalMutation({
  args: { dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const date of args.dates) {
      const jour = await ctx.db.query("accountingDays").withIndex("by_date", (q) => q.eq("date", date)).unique()
      if (!jour) continue
      const ventes = (await ctx.db.query("sales").withIndex("by_accounting_day", (q) => q.eq("accountingDayId", jour._id)).collect()).filter(
        (s) => s.status !== "en_attente_paiement" && s.status !== "expiree" && s.status !== "brouillon"
      )
      await ctx.db.patch(jour._id, {
        totalTtc: Math.round(ventes.reduce((t, s) => t + s.amounts.ttc, 0) * 100) / 100,
        totalReceived: Math.round(ventes.reduce((t, s) => t + s.amounts.received, 0) * 100) / 100,
      })
    }
  },
})

/* ═════════════════════════════ Séquences ═══════════════════════════════ */

/**
 * Remet chaque compteur de numérotation touché au dernier numéro restant,
 * pour que la numérotation reste continue après le retrait.
 */
export const recalerSequences = internalMutation({
  args: { prefixes: v.array(v.string()) },
  handler: async (ctx, args) => {
    let recales = 0
    for (const prefixe of args.prefixes) {
      // « V-OWE-PV-20260915- » → nature, point de vente, date.
      const [nature, ...reste] = prefixe.slice(0, -1).split("-")
      const date = reste.pop()!
      const code = reste.join("-")
      const cleNature = {
        V: "vente",
        B: "billet",
        G: "bagage",
        C: "colis",
        E: "vignette",
        A: "taa",
        F: "funeraire",
        X: "annulation",
        R: "remboursement",
      }[nature as "V"]
      if (!cleNature || !/^\d{8}$/.test(date)) continue
      const cle = `${code}:${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}:${cleNature}`
      const fin = `${prefixe}￿`
      const dernier =
        nature === "B"
          ? (await ctx.db.query("tickets").withIndex("by_number", (q) => q.gte("number", prefixe).lt("number", fin)).order("desc").first())?.number
          : nature === "G"
            ? (await ctx.db.query("baggages").withIndex("by_tag", (q) => q.gte("tagNumber", prefixe).lt("tagNumber", fin)).order("desc").first())?.tagNumber
            : nature === "C"
              ? (await ctx.db.query("parcels").withIndex("by_shipment", (q) => q.gte("shipmentNumber", prefixe).lt("shipmentNumber", fin)).order("desc").first())?.shipmentNumber
              : nature === "E"
                ? (await ctx.db.query("parcelItems").withIndex("by_sticker", (q) => q.gte("stickerNumber", prefixe).lt("stickerNumber", fin)).order("desc").first())?.stickerNumber
                : nature === "A"
                  ? (await ctx.db.query("vehicleTransports").withIndex("by_shipment", (q) => q.gte("shipmentNumber", prefixe).lt("shipmentNumber", fin)).order("desc").first())?.shipmentNumber
                  : nature === "F"
                    ? (await ctx.db.query("funeralTransports").withIndex("by_shipment", (q) => q.gte("shipmentNumber", prefixe).lt("shipmentNumber", fin)).order("desc").first())?.shipmentNumber
                    : (await ctx.db.query("sales").withIndex("by_number", (q) => q.gte("number", prefixe).lt("number", fin)).order("desc").first())?.number
      const valeur = dernier ? Number(dernier.slice(prefixe.length)) : 0
      const sequence = await ctx.db.query("sequences").withIndex("by_key", (q) => q.eq("key", cle)).unique()
      if (!sequence) continue
      if (valeur === 0) await ctx.db.delete(sequence._id)
      else await ctx.db.patch(sequence._id, { value: valeur })
      recales += 1
    }
    // Procès-verbaux et incidents : compteurs du réseau.
    const pvs = await ctx.db.query("procesVerbaux").collect()
    const maxPv = Math.max(0, ...pvs.map((p) => Number(p.number.replace(/\D/g, "")) || 0))
    const seqPv = await ctx.db.query("sequences").withIndex("by_key", (q) => q.eq("key", "reseau:pv")).unique()
    if (seqPv && seqPv.value !== maxPv) {
      if (maxPv === 0) await ctx.db.delete(seqPv._id)
      else await ctx.db.patch(seqPv._id, { value: maxPv })
    }
    const incidents = await ctx.db.query("incidents").collect()
    for (const seq of await ctx.db.query("sequences").withIndex("by_key", (q) => q.gte("key", "reseau:incident:").lt("key", "reseau:incident:￿")).collect()) {
      const annee = seq.key.slice("reseau:incident:".length)
      const max = Math.max(
        0,
        ...incidents.filter((i) => i.number?.startsWith(`INC-${annee}-`)).map((i) => Number(i.number!.slice(-4)))
      )
      if (max === 0) await ctx.db.delete(seq._id)
      else if (max !== seq.value) await ctx.db.patch(seq._id, { value: max })
    }
    return { recales }
  },
})

/* ═══════════════════════════ Journal d'audit ═══════════════════════════ */

/** Retire les entrées d'audit du seed, par pages. */
export const supprimerAudit = internalMutation({
  args: { curseur: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .paginate({ cursor: args.curseur, numItems: 600 })
    let supprimees = 0
    let premiere: number | null = null
    for (const log of page.page) {
      if (log.context !== CONTEXTE_AUDIT && log.context !== CONTEXTE_MANIFESTE) continue
      premiere = premiere === null ? log.createdAt : Math.min(premiere, log.createdAt)
      await ctx.db.delete(log._id)
      supprimees += 1
    }
    return { supprimees, premiere, curseur: page.continueCursor, termine: page.isDone }
  },
})
