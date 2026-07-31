import { query } from "../_generated/server"

/**
 * Comptes de démonstration proposés sur l'écran de connexion.
 *
 * Les mots de passe sont volontairement transmis au navigateur lorsque le
 * déploiement est explicitement marqué comme environnement de démonstration.
 * Désactiver `DEMO_ACCOUNTS_ENABLED` retire immédiatement le bouton et évite
 * toute fuite accidentelle sur un environnement destiné à de vrais usagers.
 */
export const list = query({
  args: {},
  handler: async () => {
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

    return accounts.flatMap((account) =>
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
