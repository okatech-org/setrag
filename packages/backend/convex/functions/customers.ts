import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, getUser, requireUser } from "../lib/auth"

/**
 * Espace client — profil, consentements et droits sur les données.
 *
 * Le CDC fait de l'espace client une option de l'achat, mais la conformité,
 * elle, ne l'est pas : consentement explicite, révocation, export et
 * suppression sont exigés par la loi gabonaise comme par la gouvernance
 * ERAMET.
 */

/** Version courante des conditions générales de vente. */
export const CURRENT_CGV_VERSION = "cgv-2026-07"

/** Profil du voyageur connecté, ou `null` s'il ne l'est pas. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return null
    const consents = await ctx.db
      .query("consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    return {
      user,
      consents: consents.filter((c) => c.revokedAt === undefined),
    }
  },
})

/**
 * Crée le profil applicatif au premier accès.
 *
 * Better Auth gère l'identité ; cette table porte le rôle et les données
 * métier. L'appel est idempotent : un profil existant est simplement
 * rafraîchi.
 */
export const ensureProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Non authentifié")

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
        phone: args.phone ?? existing.phone,
        email: args.email ?? existing.email,
        lastSeenAt: Date.now(),
      })
      return existing._id
    }

    // Tout compte créé par le parcours public est un voyageur : les rôles
    // internes sont provisionnés par l'administration, jamais auto-attribués.
    return await ctx.db.insert("users", {
      authId: identity.subject,
      firstName: args.firstName,
      lastName: args.lastName,
      phone: args.phone ?? identity.phoneNumber,
      email: args.email ?? identity.email,
      role: "voyageur",
      identitySource: "local",
      isActive: true,
      lastSeenAt: Date.now(),
    })
  },
})

export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await ctx.db.patch(user._id, {
      firstName: args.firstName ?? user.firstName,
      lastName: args.lastName ?? user.lastName,
      phone: args.phone ?? user.phone,
      email: args.email ?? user.email,
    })
  },
})

/* ────────────────────── Voyageurs enregistrés ─────────────────────────── */

/**
 * Fiches de voyageurs mémorisées, pour préremplir un dossier.
 *
 * Ces fiches n'ont aucune valeur de titre : le billet fige sa propre copie de
 * l'identité au moment de l'émission, et modifier une fiche ici ne touche
 * jamais un billet déjà vendu.
 */
export const listSavedPassengers = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const rows = await ctx.db
      .query("savedPassengers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    return rows.sort((a, b) => a.lastName.localeCompare(b.lastName))
  },
})

const savedPassengerFields = {
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  discountCode: v.optional(v.string()),
}

export const addSavedPassenger = mutation({
  args: savedPassengerFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (!args.lastName.trim() || !args.firstName.trim()) {
      throw new Error("Le nom et le prénom du voyageur sont obligatoires")
    }

    const now = Date.now()
    const id = await ctx.db.insert("savedPassengers", {
      ...args,
      lastName: args.lastName.trim(),
      firstName: args.firstName.trim(),
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    })

    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.ajouter",
      entityTable: "savedPassengers",
      entityId: id,
      after: { lastName: args.lastName, firstName: args.firstName },
    })
    return id
  },
})

export const updateSavedPassenger = mutation({
  args: { passengerId: v.id("savedPassengers"), ...savedPassengerFields },
  handler: async (ctx, { passengerId, ...fields }) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.get(passengerId)
    // On ne révèle pas qu'une fiche existe chez quelqu'un d'autre : même
    // message dans les deux cas.
    if (!existing || existing.userId !== user._id) {
      throw new Error("Voyageur enregistré introuvable")
    }
    if (!fields.lastName.trim() || !fields.firstName.trim()) {
      throw new Error("Le nom et le prénom du voyageur sont obligatoires")
    }

    await ctx.db.patch(passengerId, {
      ...fields,
      lastName: fields.lastName.trim(),
      firstName: fields.firstName.trim(),
      updatedAt: Date.now(),
    })

    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.modifier",
      entityTable: "savedPassengers",
      entityId: passengerId,
      before: { lastName: existing.lastName, firstName: existing.firstName },
      after: { lastName: fields.lastName, firstName: fields.firstName },
    })
  },
})

export const removeSavedPassenger = mutation({
  args: { passengerId: v.id("savedPassengers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.get(args.passengerId)
    if (!existing || existing.userId !== user._id) {
      throw new Error("Voyageur enregistré introuvable")
    }

    await ctx.db.delete(args.passengerId)
    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.supprimer",
      entityTable: "savedPassengers",
      entityId: args.passengerId,
      before: { lastName: existing.lastName, firstName: existing.firstName },
    })
  },
})

/* ───────────────────────────── Consentements ───────────────────────────── */

/** Enregistre un consentement explicite, horodaté et versionné. */
export const grantConsent = mutation({
  args: {
    type: v.union(
      v.literal("cgv"),
      v.literal("donnees"),
      v.literal("marketing"),
    ),
    version: v.optional(v.string()),
    channel: v.union(
      v.literal("web"),
      v.literal("mobile"),
      v.literal("guichet"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const version = args.version ?? CURRENT_CGV_VERSION

    // Un consentement déjà actif pour la même version n'est pas dupliqué.
    const existing = await ctx.db
      .query("consents")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user._id).eq("type", args.type),
      )
      .collect()
    const actif = existing.find(
      (c) => c.version === version && c.revokedAt === undefined,
    )
    if (actif) return actif._id

    return await ctx.db.insert("consents", {
      userId: user._id,
      type: args.type,
      version,
      grantedAt: Date.now(),
      channel: args.channel,
    })
  },
})

/** Révoque un consentement — droit d'opposition. */
export const revokeConsent = mutation({
  args: {
    type: v.union(
      v.literal("cgv"),
      v.literal("donnees"),
      v.literal("marketing"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.type === "cgv") {
      throw new Error(
        "Les conditions générales ne peuvent pas être révoquées tant qu'une " +
          "réservation est en cours",
      )
    }
    const consents = await ctx.db
      .query("consents")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user._id).eq("type", args.type),
      )
      .collect()
    let revoked = 0
    for (const consent of consents.filter((c) => c.revokedAt === undefined)) {
      await ctx.db.patch(consent._id, { revokedAt: Date.now() })
      revoked += 1
    }
    return { revoked }
  },
})

export const listConsents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await ctx.db
      .query("consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  },
})

/* ──────────────────────── Droits sur les données ───────────────────────── */

/**
 * Export des données personnelles — droit d'accès.
 * Rassemble tout ce que le système détient sur le voyageur connecté.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()

    const tickets = []
    for (const sale of sales) {
      const t = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      tickets.push(...t)
    }

    const [consents, notifications, savedPassengers] = await Promise.all([
      ctx.db
        .query("consents")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("savedPassengers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ])

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        createdAt: new Date(user._creationTime).toISOString(),
      },
      sales: sales.map((s) => ({
        reference: s.number,
        date: new Date(s.soldAt).toISOString(),
        status: s.status,
        amountTtc: s.amounts.ttc,
      })),
      tickets: tickets.map((t) => ({
        number: t.number,
        passenger: t.passenger,
        serviceClass: t.serviceClass,
        status: t.status,
      })),
      consents,
      // Ces fiches ne servent qu'au préremplissage, mais elles portent des
      // données personnelles de tiers : elles font partie de l'export.
      savedPassengers: savedPassengers.map((p) => ({
        lastName: p.lastName,
        firstName: p.firstName,
        gender: p.gender,
        phone: p.phone,
        emergencyPhone: p.emergencyPhone,
        birthDate: p.birthDate,
      })),
      notifications: notifications.length,
    }
  },
})

/**
 * Suppression du compte — droit à l'effacement.
 *
 * Les données commerciales et comptables ne sont PAS supprimées : elles
 * relèvent d'une obligation de conservation. Le profil est anonymisé, ce qui
 * satisfait le droit à l'effacement sans casser la comptabilité.
 */
export const deleteMyAccount = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.confirmation !== "SUPPRIMER") {
      throw new Error(
        "Confirmation invalide : saisissez SUPPRIMER pour effacer le compte",
      )
    }

    const pending = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()
    const enCours = pending.filter(
      (s) => s.status === "en_attente_paiement",
    )
    if (enCours.length > 0) {
      throw new Error(
        `${enCours.length} réservation(s) en cours : réglez-les ou annulez-` +
          `les avant de supprimer le compte`,
      )
    }

    await ctx.db.patch(user._id, {
      firstName: "Compte",
      lastName: "supprimé",
      phone: undefined,
      email: undefined,
      isActive: false,
    })

    const consents = await ctx.db
      .query("consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    for (const consent of consents.filter((c) => c.revokedAt === undefined)) {
      await ctx.db.patch(consent._id, { revokedAt: Date.now() })
    }

    // Les fiches de voyageurs n'ont aucune valeur comptable : contrairement au
    // profil, qui est anonymisé, elles sont effacées pour de bon.
    const savedPassengers = await ctx.db
      .query("savedPassengers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    for (const passenger of savedPassengers) {
      await ctx.db.delete(passenger._id)
    }

    await audit(ctx, {
      actorId: user._id,
      action: "compte.supprimer",
      entityTable: "users",
      entityId: user._id,
      after: {
        anonymized: true,
        note: "Données commerciales conservées par obligation légale",
      },
    })

    return { anonymized: true, salesRetained: pending.length }
  },
})
