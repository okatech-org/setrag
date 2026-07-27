import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import { toServiceDate } from "../model/calendar"

/**
 * Enveloppe commune à toute vente, quel que soit le produit.
 *
 * Les cinq produits du CDC §7.1 partagent le même circuit : un point de
 * vente, une session de caisse ouverte, une journée comptable, une séquence
 * de numérotation et une grille tarifaire en vigueur. Ces éléments sont ici
 * pour que billets, bagages, colis et transports spéciaux se comportent
 * exactement de la même façon face à la caisse et à la comptabilité.
 */

/** Incrémente une séquence de numérotation et retourne sa nouvelle valeur. */
export async function nextSequence(
  ctx: MutationCtx,
  key: string,
): Promise<number> {
  const existing = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  if (existing) {
    const value = existing.value + 1
    await ctx.db.patch(existing._id, { value })
    return value
  }
  await ctx.db.insert("sequences", { key, value: 1 })
  return 1
}

/**
 * Journée comptable ouverte du jour, créée à la volée si nécessaire.
 * Lève si la journée est déjà clôturée : aucune vente ne peut plus s'y
 * rattacher, sous peine de fausser un déversement déjà transmis.
 */
export async function currentAccountingDay(
  ctx: MutationCtx,
): Promise<Doc<"accountingDays">> {
  const date = toServiceDate(Date.now())
  const existing = await ctx.db
    .query("accountingDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique()
  if (existing) {
    if (existing.status === "cloturee") {
      throw new Error(
        `Journée comptable du ${date} déjà clôturée : vente impossible`,
      )
    }
    return existing
  }
  const id = await ctx.db.insert("accountingDays", {
    date,
    status: "ouverte",
    openedAt: Date.now(),
    totalTtc: 0,
    totalReceived: 0,
  })
  return (await ctx.db.get(id))!
}

/** Grille tarifaire en vigueur, avec ses bases, réductions et barèmes annexes. */
export async function activeFareSchedule(ctx: MutationCtx | QueryCtx) {
  const schedule = await ctx.db
    .query("fareSchedules")
    .withIndex("by_status", (q) => q.eq("status", "actif"))
    .first()
  if (!schedule) {
    throw new Error("Aucune grille tarifaire active : vente impossible")
  }
  const [bases, discounts, ancillary] = await Promise.all([
    ctx.db
      .query("fareBases")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
    ctx.db
      .query("discounts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
    ctx.db
      .query("ancillaryFares")
      .withIndex("by_schedule_product", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
  ])
  return { schedule, bases, discounts, ancillary }
}

/** Contexte de vente d'un agent : point de vente, caisse, journée. */
export interface SellingContext {
  pointOfSale: Doc<"pointsOfSale">
  session: Doc<"cashSessions">
  accountingDay: Doc<"accountingDays">
  serviceDate: string
}

/**
 * Vérifie qu'un agent est en mesure de vendre et retourne son contexte.
 *
 * Trois conditions, toutes exigées par le circuit de recettes du CDC §7.7 :
 * être rattaché à un point de vente actif, avoir une session de caisse
 * ouverte, et opérer sur une journée comptable non clôturée.
 */
export async function requireSellingContext(
  ctx: MutationCtx,
  actor: Doc<"users">,
): Promise<SellingContext> {
  if (!actor.pointOfSaleId) {
    throw new Error("Agent non rattaché à un point de vente : vente impossible")
  }
  const pointOfSale = await ctx.db.get(actor.pointOfSaleId)
  if (!pointOfSale || !pointOfSale.isActive) {
    throw new Error("Point de vente inconnu ou fermé")
  }

  const session = await ctx.db
    .query("cashSessions")
    .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
    .filter((q) => q.eq(q.field("status"), "ouverte"))
    .first()
  if (!session) {
    throw new Error("Aucune session de caisse ouverte : vente impossible")
  }

  const accountingDay = await currentAccountingDay(ctx)
  return {
    pointOfSale,
    session,
    accountingDay,
    serviceDate: toServiceDate(Date.now()),
  }
}

/** Ajoute une vente aux totaux de la journée comptable. */
export async function accrueToAccountingDay(
  ctx: MutationCtx,
  day: Doc<"accountingDays">,
  ttc: number,
  received: number,
): Promise<void> {
  await ctx.db.patch(day._id, {
    totalTtc: day.totalTtc + ttc,
    totalReceived: day.totalReceived + received,
  })
}
