/**
 * Conversations d'exemple de SETRAG Copilot.
 *
 * Commande (depuis `packages/backend`, déploiement où
 * `DEMO_ACCOUNTS_ENABLED=true`, après le provisionnement des comptes de
 * démonstration) :
 *
 *   bunx convex run modules/copilot/seed:run '{}'
 *   bunx convex run modules/copilot/seed:run '{"reset": true}'
 *
 * Chaque conversation est marquée `exemple: true` et son titre commence par
 * « [Exemple] » : elle montre la forme d'une réponse (sources, refus hors
 * périmètre, proposition à confirmer) sans prétendre avoir été produite par
 * le modèle. Idempotent : un compte qui a déjà ses exemples n'en reçoit pas
 * d'autres ; `reset` supprime les exemples (et leurs lignes de journal) avant
 * de les recréer. Les vraies conversations ne sont jamais touchées.
 */

import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import type { AppRole } from "../../model/permissions"

const MINUTE = 60_000

type Exemple = {
  titre: string
  roles: readonly AppRole[]
  echanges: readonly {
    question: string
    reponse: string
    sources: readonly { outil: string; libelle: string; lien?: string }[]
    outils: readonly { nom: string; libelle: string; statut: "ok" | "refuse" }[]
  }[]
}

const EXEMPLES: readonly Exemple[] = [
  {
    titre: "[Exemple] Ce qui attend ma signature",
    roles: ["direction_generale"],
    echanges: [
      {
        question: "Qu'est-ce qui attend ma signature dans le parapheur ?",
        reponse:
          "Conversation d'exemple — la forme d'une réponse de Copilot.\n\n- Avenant à la convention de transport de minerai : signature attendue, deux visas déjà donnés (source : Mon parapheur).\n- Procès-verbal d'incident au PK 214 : en attente du visa audit, votre signature suivra (source : Mon parapheur).\n\nOuvrez le parapheur pour viser ou signer : Copilot ne signe jamais à votre place.",
        sources: [{ outil: "mon_parapheur", libelle: "Mon parapheur", lien: "/bureautique/parapheur" }],
        outils: [{ nom: "mon_parapheur", libelle: "Mon parapheur", statut: "ok" }],
      },
    ],
  },
  {
    titre: "[Exemple] Durées de conservation à confirmer",
    roles: ["juriste"],
    echanges: [
      {
        question: "Quelles durées de conservation de la GED reposent sur un texte légal ?",
        reponse:
          "Conversation d'exemple — la forme d'une réponse de Copilot.\n\nSeules les pièces comptables et les états financiers s'appuient sur un texte précis : l'Acte uniforme OHADA relatif au droit comptable (dix ans) (source : Études et dossier de recette). Les autres séries portent une durée de politique interne, signalée « à valider » dans le plan de classement.",
        sources: [
          {
            outil: "rechercher_etudes",
            libelle: "Cadre réglementaire : OHADA, fiscalité et droit social gabonais",
            lien: "/etudes/05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON",
          },
        ],
        outils: [{ nom: "rechercher_etudes", libelle: "Études et dossier de recette", statut: "ok" }],
      },
    ],
  },
  {
    titre: "[Exemple] Actions d'audit en retard",
    roles: ["audit_risques"],
    echanges: [
      {
        question: "Quelles actions d'audit sont en retard ?",
        reponse:
          "Conversation d'exemple — la forme d'une réponse de Copilot.\n\nLe plan d'actions compte des actions dont l'échéance est dépassée ; ouvrez le plan pour les relancer (source : Plan d'actions d'audit).",
        sources: [{ outil: "plan_actions_audit", libelle: "Plan d'actions d'audit", lien: "/etudes/plan-actions" }],
        outils: [{ nom: "plan_actions_audit", libelle: "Plan d'actions d'audit", statut: "ok" }],
      },
      {
        question: "Donne-moi le résultat du match d'hier soir.",
        reponse:
          "Conversation d'exemple — refus hors périmètre.\n\nJe ne réponds qu'aux questions de travail à la SETRAG : ventes, exploitation, fret, documents, études et audit.",
        sources: [],
        outils: [{ nom: "hors_perimetre", libelle: "Hors périmètre", statut: "refuse" }],
      },
    ],
  },
  {
    titre: "[Exemple] Recettes du jour",
    roles: ["admin_fonctionnel", "chef_vente", "responsable_kpi"],
    echanges: [
      {
        question: "Où en sont les ventes aujourd'hui ?",
        reponse:
          "Conversation d'exemple — la forme d'une réponse de Copilot.\n\nCopilot lit la journée comptable du jour et rend le nombre de ventes confirmées, le chiffre d'affaires TTC en XAF et la répartition par canal, avec sa source (source : Ventes du jour).",
        sources: [{ outil: "ventes_du_jour", libelle: "Ventes du jour", lien: "/gestion/recettes" }],
        outils: [{ nom: "ventes_du_jour", libelle: "Ventes du jour", statut: "ok" }],
      },
    ],
  },
]

async function comptesPour(ctx: MutationCtx, roles: readonly AppRole[]): Promise<Id<"users">[]> {
  for (const role of roles) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .collect()
    const actifs = users.filter((user) => user.isActive).map((user) => user._id)
    if (actifs.length > 0) return actifs
  }
  return []
}

export const run = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    let supprimees = 0
    if (args.reset) {
      const exemples = await ctx.db
        .query("copilotConversations")
        .withIndex("by_exemple", (q) => q.eq("exemple", true))
        .collect()
      for (const conversation of exemples) {
        const messages = await ctx.db
          .query("copilotMessages")
          .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversation._id))
          .collect()
        for (const message of messages) await ctx.db.delete(message._id)
        await ctx.db.delete(conversation._id)
        supprimees += 1
      }
      const journal = await ctx.db
        .query("copilotJournal")
        .withIndex("by_exemple", (q) => q.eq("exemple", true))
        .collect()
      for (const ligne of journal) await ctx.db.delete(ligne._id)
    }

    const existantes = await ctx.db
      .query("copilotConversations")
      .withIndex("by_exemple", (q) => q.eq("exemple", true))
      .collect()
    const dejaFaites = new Set(existantes.map((conversation) => `${conversation.userId}|${conversation.titre}`))
    const maintenant = Date.now()
    let creees = 0
    for (const [rang, exemple] of EXEMPLES.entries()) {
      for (const userId of await comptesPour(ctx, exemple.roles)) {
        if (dejaFaites.has(`${userId}|${exemple.titre}`)) continue
        const user = (await ctx.db.get(userId))!
        const debut = maintenant - (rang + 1) * 3 * 60 * MINUTE
        const conversationId = await ctx.db.insert("copilotConversations", {
          userId,
          titre: exemple.titre,
          statut: "active",
          exemple: true,
          createdAt: debut,
          lastMessageAt: debut + exemple.echanges.length * 2 * MINUTE,
        })
        for (const [index, echange] of exemple.echanges.entries()) {
          const at = debut + index * 2 * MINUTE
          const requestId = `exemple-${rang}-${index}`
          await ctx.db.insert("copilotMessages", {
            conversationId,
            requestId,
            role: "user",
            contenu: echange.question,
            statut: "termine",
            sources: [],
            outils: [],
            createdAt: at,
            updatedAt: at,
          })
          await ctx.db.insert("copilotMessages", {
            conversationId,
            requestId,
            role: "assistant",
            contenu: echange.reponse,
            statut: "termine",
            sources: echange.sources.map((source) => ({ ...source })),
            outils: echange.outils.map((outil) => ({ ...outil })),
            provider: "exemple",
            model: "conversation d'exemple",
            createdAt: at + 1,
            updatedAt: at + 1,
          })
          await ctx.db.insert("copilotJournal", {
            userId,
            role: user.role,
            conversationId,
            requestId,
            evenement: echange.outils.some((outil) => outil.nom === "hors_perimetre") ? "hors_perimetre" : "question",
            detail: echange.question,
            exemple: true,
            createdAt: at,
          })
        }
        creees += 1
      }
    }
    return { creees, supprimees }
  },
})
