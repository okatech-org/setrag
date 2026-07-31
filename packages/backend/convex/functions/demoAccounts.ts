import { v } from "convex/values"
import { query } from "../_generated/server"

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

    const accounts = [
      {
        key: "agent",
        label: "Compte agent",
        description: "Vente au guichet · Owendo",
        email: process.env.DEMO_AGENT_EMAIL,
        password: process.env.DEMO_AGENT_PASSWORD,
      },
      {
        key: "gestion",
        label: "Compte gestion",
        description: "Administration fonctionnelle · réseau",
        email: process.env.DEMO_MANAGEMENT_EMAIL,
        password: process.env.DEMO_MANAGEMENT_PASSWORD,
      },
      {
        key: "controle",
        label: "Compte contrôleur",
        description: "Contrôle à bord · Owendo",
        email: process.env.DEMO_CONTROL_EMAIL,
        password: process.env.DEMO_CONTROL_PASSWORD,
      },
    ] as const

    const demandes = args.only
    return accounts
      .filter((account) => !demandes || demandes.includes(account.key))
      .flatMap((account) =>
        account.email && account.password
          ? [
              {
                ...account,
                email: account.email,
                password: account.password,
              },
            ]
          : []
      )
  },
})
