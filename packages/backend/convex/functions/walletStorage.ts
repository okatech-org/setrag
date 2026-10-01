import { v } from "convex/values"

import { internalMutation } from "../_generated/server"

/**
 * Le pass Apple Wallet porte le nom du voyageur et le code signé du billet :
 * son URL de stockage ne doit servir que le temps de l'ouvrir. `createPass`
 * programme cet effacement dès qu'il le dépose.
 */
export const effacerPass = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    if (await ctx.db.system.get(args.storageId)) await ctx.storage.delete(args.storageId)
  },
})
