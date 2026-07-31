import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { audit } from "../lib/auth"
import { APP_ROLES, type AppRole } from "../model/permissions"

/**
 * Provisionnement d'un compte du personnel.
 *
 * Better Auth crée les comptes ; c'est cette table qui porte le RÔLE. Un
 * compte fraîchement inscrit est donc « voyageur » tant qu'un administrateur
 * ne l'a pas habilité — règle voulue, voir `customers.ensureProfile`.
 *
 * Cette mutation est l'outil d'exploitation qui fait ce rattachement quand
 * aucun administrateur n'existe encore : amorçage d'un déploiement, poste de
 * contrôleur à ouvrir, environnement de recette. Elle est INTERNE — aucun
 * client ne peut l'appeler, seule la CLI du déploiement le peut :
 *
 *   bunx convex run seeds/staffAccounts:grantRole \
 *     '{"email":"controleur@setrag.ga","role":"controleur_train","matricule":"C-401"}'
 */
export const grantRole = internalMutation({
  args: {
    email: v.string(),
    role: v.string(),
    matricule: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    pointOfSaleCode: v.optional(v.string()),
    /**
     * Identifiant Better Auth, à fournir uniquement quand le compte n'a
     * jamais ouvert de session : le profil applicatif n'existe alors pas
     * encore et cette mutation le crée, déjà habilité.
     */
    authId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const role = APP_ROLES.find((candidate) => candidate === args.role) as
      | AppRole
      | undefined
    if (!role) {
      throw new Error(
        `Rôle inconnu : ${args.role}. Rôles valides : ${APP_ROLES.join(", ")}`
      )
    }

    const email = args.email.trim().toLowerCase()

    // Le point de vente est résolu AVANT toute écriture : un agent créé sans
    // rattachement ne pourrait pas ouvrir de caisse, donc pas vendre à bord,
    // et il ne s'en apercevrait qu'au premier voyageur à régulariser.
    let pointOfSaleId: Id<"pointsOfSale"> | undefined
    if (args.pointOfSaleCode) {
      const pos = await ctx.db
        .query("pointsOfSale")
        .withIndex("by_code", (q) => q.eq("code", args.pointOfSaleCode!))
        .unique()
      if (!pos) {
        throw new Error(`Point de vente inconnu : ${args.pointOfSaleCode}`)
      }
      pointOfSaleId = pos._id
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique()

    const byAuthId = args.authId
      ? await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", args.authId!))
          .unique()
      : null

    const user = existing ?? byAuthId
    if (!user) {
      if (!args.authId) {
        throw new Error(
          `Aucun profil applicatif pour ${email}. Fournissez « authId » pour ` +
            `créer le profil, ou faites ouvrir une première session au compte.`
        )
      }
      const userId = await ctx.db.insert("users", {
        authId: args.authId,
        email,
        firstName: args.firstName,
        lastName: args.lastName,
        matricule: args.matricule,
        role,
        pointOfSaleId,
        identitySource: "local",
        isActive: true,
      })
      await audit(ctx, {
        actorId: userId,
        action: "utilisateur.habiliter",
        entityTable: "users",
        entityId: userId,
        after: { role, matricule: args.matricule, source: "cli", created: true },
      })
      return { userId, email, role, matricule: args.matricule, created: true }
    }

    await ctx.db.patch(user._id, {
      role,
      matricule: args.matricule ?? user.matricule,
      firstName: args.firstName ?? user.firstName,
      lastName: args.lastName ?? user.lastName,
      // Un rattachement existant n'est effacé que si l'on en désigne un autre.
      pointOfSaleId: pointOfSaleId ?? user.pointOfSaleId,
    })

    // Le changement de rôle est une action sensible : il est journalisé même
    // lorsqu'il vient de la CLI, avec l'agent lui-même pour acteur faute de
    // mieux — c'est l'objet du changement qui compte ici, pas son auteur.
    await audit(ctx, {
      actorId: user._id,
      action: "utilisateur.habiliter",
      entityTable: "users",
      entityId: user._id,
      before: { role: user.role },
      after: { role, matricule: args.matricule, source: "cli" },
    })

    return { userId: user._id, email, role, matricule: args.matricule }
  },
})
