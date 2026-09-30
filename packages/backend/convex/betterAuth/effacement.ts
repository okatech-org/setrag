import { v } from "convex/values"

import { components } from "../_generated/api"
import { internalMutation } from "../_generated/server"

/**
 * Efface l'identité Better Auth d'un compte supprimé : ses sessions, ses
 * comptes de connexion (téléphone, e-mail), puis l'utilisateur lui-même.
 *
 * Sans cela, la session ouverte survivrait à la suppression, et une
 * reconnexion avec le même numéro retrouverait le profil anonymisé au lieu
 * d'ouvrir un compte neuf. Planifiée par `customers.deleteMyAccount`, qui a
 * déjà détaché le profil applicatif de cette identité.
 */
export const effacerIdentite = internalMutation({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    for (const model of ["session", "account"] as const) {
      await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        input: { model, where: [{ field: "userId", value: args.authId }] },
        paginationOpts: { cursor: null, numItems: 200 },
      })
    }
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: args.authId }] },
    })
  },
})
