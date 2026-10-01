import { v } from "convex/values"

import { mutation, query } from "../_generated/server"
import { requireUser } from "../lib/auth"

/**
 * Préférences personnelles du portail agent : raccourcis clavier du menu.
 *
 * Ce sont des réglages d'ergonomie, propres à chaque agent : tout compte actif
 * lit et modifie les siens, et seulement les siens. Ils n'ouvrent aucun droit —
 * une touche ne mène qu'à une page que le rôle peut déjà ouvrir.
 */

/** Touche acceptée : une lettre ou un chiffre, sans modificateur. */
const TOUCHE = /^[a-z0-9]$/

export const mesPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const ligne = await ctx.db
      .query("agentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
    return {
      raccourcisActifs: ligne?.raccourcisActifs ?? true,
      afficherTouches: ligne?.afficherTouches ?? true,
      touches: ligne?.touches ?? {},
      personnalise: ligne !== null,
    }
  },
})

export const enregistrerRaccourcis = mutation({
  args: {
    raccourcisActifs: v.boolean(),
    afficherTouches: v.boolean(),
    touches: v.record(v.string(), v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const touches: Record<string, string | null> = {}
    const prises = new Map<string, string>()
    for (const [chemin, brute] of Object.entries(args.touches)) {
      if (!chemin.startsWith("/") || chemin.length > 120) throw new Error(`Rubrique invalide : ${chemin}`)
      if (brute === null) {
        touches[chemin] = null
        continue
      }
      const touche = brute.toLowerCase()
      if (!TOUCHE.test(touche)) throw new Error(`Touche invalide pour ${chemin} : une lettre ou un chiffre.`)
      const deja = prises.get(touche)
      if (deja) throw new Error(`La touche ${touche.toUpperCase()} est déjà prise par ${deja}.`)
      prises.set(touche, chemin)
      touches[chemin] = touche
    }
    const existante = await ctx.db
      .query("agentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
    const valeur = {
      userId: user._id,
      raccourcisActifs: args.raccourcisActifs,
      afficherTouches: args.afficherTouches,
      touches,
      updatedAt: Date.now(),
    }
    if (existante) await ctx.db.replace(existante._id, valeur)
    else await ctx.db.insert("agentPreferences", valeur)
  },
})

/** Revient aux réglages par défaut : la ligne disparaît. */
export const reinitialiserRaccourcis = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const existante = await ctx.db
      .query("agentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
    if (existante) await ctx.db.delete(existante._id)
  },
})
