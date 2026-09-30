import { v } from "convex/values"
import { query } from "../_generated/server"
import { configuredDemoAccounts } from "../model/demoPersonas"

/**
 * Comptes de démonstration proposés sur l'écran de connexion.
 *
 * Les mots de passe sont volontairement transmis au navigateur lorsque le
 * déploiement est explicitement marqué comme environnement de démonstration.
 * Désactiver `DEMO_ACCOUNTS_ENABLED` retire immédiatement le bouton et évite
 * toute fuite accidentelle sur un environnement destiné à de vrais usagers.
 *
 * Chaque application ne demande QUE les comptes qui la concernent : proposer
 * un compte guichet sur le terminal d'un contrôleur n'aurait aucun sens, et
 * transmettrait au passage des identifiants dont cette application n'a pas
 * l'usage.
 */
export const list = query({
  args: {
    /** Clés à retourner. Toutes si absent, pour ne rien casser d'existant. */
    only: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") return []

    const demandes = args.only
    return configuredDemoAccounts(process.env).filter(
      (account) => !demandes || demandes.includes(account.key)
    )
  },
})
