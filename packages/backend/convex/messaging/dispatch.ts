import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"

/**
 * Route une outbox générique vers l'adaptateur du canal. Ajouter WhatsApp ne
 * doit modifier que ce petit aiguillage et le nouvel adaptateur.
 */
export const flushThread = internalAction({
  args: { threadId: v.id("messagingThreads") },
  handler: async (
    ctx,
    args
  ): Promise<{ scheduled: boolean; channel?: string }> => {
    const thread = await ctx.runQuery(internal.messaging.core.getThread, args)
    if (!thread) throw new Error("Conversation multicanale introuvable.")

    switch (thread.channel) {
      case "telegram":
        await ctx.scheduler.runAfter(
          0,
          internal.messaging.telegram.flushThread,
          args
        )
        return { scheduled: true, channel: thread.channel }
      default:
        return { scheduled: false, channel: thread.channel }
    }
  },
})
