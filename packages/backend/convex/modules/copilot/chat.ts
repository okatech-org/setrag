import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { action } from "../../_generated/server"
import { safetyIdentifierFor } from "../../ai/conversations"
import { RegroupeurFlux } from "../../ai/flux"
import {
  ProviderError,
  createProviderSession,
  type HistoryEntry,
  type ProviderToolResult,
} from "../../ai/providers"
import { assistantRateLimiter } from "../../ai/rateLimiter"
import {
  OUTILS_COPILOT,
  configurationModele,
  consignes,
  fusionnerSources,
  outilParNom,
  type SourceCopilot,
} from "./model"

const MAX_ETAPES = 6

const REPONSE_INACHEVEE =
  "Je n'ai pas pu terminer cette analyse. Reformulez ou précisez la question."

type OutilTrace = { nom: string; libelle: string; statut: "ok" | "refuse" | "erreur" | "confirmation" }

export type ResultatTour =
  | { etat: "deja_termine" }
  | { etat: "non_configure" }
  | { etat: "termine"; messageId: Id<"copilotMessages"> }
  | { etat: "erreur"; messageId: Id<"copilotMessages">; message: string }

function libelleErreur(error: unknown): string {
  if (error instanceof ProviderError && error.status === 429) {
    return "Copilot est très sollicité en ce moment. Relancez votre question dans un instant."
  }
  if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
    return "La clé du fournisseur de modèles est refusée : la DSI doit la renouveler."
  }
  return "La réponse a été interrompue. Relancez votre question."
}

/**
 * Pose une question à Copilot. La réponse s'écrit au fil du flux dans son
 * message (lu par la query réactive `conversation`) ; les outils lisent le
 * SI avec les droits de l'agent, revérifiés à chaque appel.
 */
export const envoyerMessage = action({
  args: {
    conversationId: v.id("copilotConversations"),
    requestId: v.string(),
    contenu: v.string(),
  },
  handler: async (ctx, args): Promise<ResultatTour> => {
    const debut = Date.now()
    const identite = await ctx.auth.getUserIdentity()
    if (!identite) throw new Error("Non authentifié")
    const cleLimite = `copilot:${identite.subject}`
    const limite = await assistantRateLimiter.limit(ctx, "textMessage", { key: cleLimite })
    if (!limite.ok) {
      throw new Error(
        `Trop de questions successives. Réessayez dans ${Math.ceil((limite.retryAfter ?? 0) / 1_000)} seconde(s).`
      )
    }

    const config = configurationModele()
    const tour = await ctx.runMutation(internal.modules.copilot.conversations.debuterTour, {
      conversationId: args.conversationId,
      requestId: args.requestId,
      contenu: args.contenu,
      configure: config.apiKey.length > 0,
      provider: config.provider,
      model: config.model,
    })
    if (tour.etat !== "nouveau") return { etat: tour.etat }

    const messageId = tour.messageId
    const ouverts = OUTILS_COPILOT.filter((outil) => tour.ouverts.includes(outil.name))
    const fermes = OUTILS_COPILOT.filter((outil) => !tour.ouverts.includes(outil.name))
    const outilsTraces: OutilTrace[] = []
    const sources: SourceCopilot[] = []
    const flux = new RegroupeurFlux({
      ecrire: (texte) =>
        ctx
          .runMutation(internal.modules.copilot.conversations.ecrireReponse, { messageId, contenu: texte })
          .catch(() => undefined),
    })

    try {
      const session = createProviderSession({
        config,
        instructions: consignes({
          nom: tour.nom,
          role: tour.role,
          roleLibelle: tour.roleLibelle,
          maintenant: new Date(),
          ouverts,
          fermes,
        }),
        messages: tour.historique as HistoryEntry[],
        tools: ouverts,
        safetyIdentifier: safetyIdentifierFor(cleLimite),
      })

      let resultats: ProviderToolResult[] | undefined
      let tokensEntree = 0
      let tokensSortie = 0
      let fini = false
      for (let etape = 0; etape < MAX_ETAPES; etape += 1) {
        if (etape > 0) flux.nouvelleEtape()
        const reponse = await session.next(resultats, (morceau) => flux.ajouter(morceau))
        tokensEntree += reponse.inputTokens ?? 0
        tokensSortie += reponse.outputTokens ?? 0
        if (reponse.toolCalls.length === 0) {
          fini = true
          break
        }
        await flux.vider()
        resultats = []
        for (const appel of reponse.toolCalls) {
          const outil = outilParNom(appel.name)
          const entreeJson = JSON.stringify(appel.input ?? {})
          if (!outil || !tour.ouverts.includes(outil.name)) {
            outilsTraces.push({ nom: appel.name, libelle: outil?.label ?? appel.name, statut: "refuse" })
            await ctx.runMutation(internal.modules.copilot.conversations.journaliser, {
              conversationId: args.conversationId,
              requestId: args.requestId,
              evenement: "outil_refuse",
              outil: appel.name,
            })
            resultats.push({
              ...appel,
              output: { status: "error", message: "Outil fermé à ce compte : dis-le à l'agent sans contourner." },
            })
            continue
          }
          if (outil.name === "hors_perimetre") {
            const motif = typeof (appel.input as { motif?: unknown })?.motif === "string"
              ? (appel.input as { motif: string }).motif
              : undefined
            outilsTraces.push({ nom: outil.name, libelle: outil.label, statut: "refuse" })
            await ctx.runMutation(internal.modules.copilot.conversations.journaliser, {
              conversationId: args.conversationId,
              requestId: args.requestId,
              evenement: "hors_perimetre",
              outil: outil.name,
              detail: motif,
            })
            resultats.push({
              ...appel,
              output: {
                status: "ok",
                consigne: "Refuse en une phrase, poliment, et rappelle ce que Copilot sait faire pour la SETRAG.",
              },
            })
            continue
          }
          if (outil.requiresApproval) {
            const proposition = await ctx.runMutation(internal.modules.copilot.conversations.proposerAction, {
              conversationId: args.conversationId,
              messageId,
              requestId: args.requestId,
              entreeJson,
            })
            outilsTraces.push({
              nom: outil.name,
              libelle: outil.label,
              statut: proposition.ok ? "confirmation" : "erreur",
            })
            resultats.push({
              ...appel,
              output: proposition.ok
                ? {
                    status: "confirmation_requise",
                    message:
                      "Proposition préparée, RIEN n'est enregistré : l'agent doit cliquer sur « Confirmer » dans la carte affichée sous ta réponse.",
                  }
                : { status: "error", message: proposition.message },
            })
            continue
          }
          const budget = await assistantRateLimiter.limit(ctx, "toolCall", { key: cleLimite })
          if (!budget.ok) {
            outilsTraces.push({ nom: outil.name, libelle: outil.label, statut: "erreur" })
            resultats.push({ ...appel, output: { status: "error", message: "Trop d'appels d'outils : réessaie plus tard." } })
            continue
          }
          const debutOutil = Date.now()
          const lecture = await ctx.runQuery(internal.modules.copilot.lecture.executer, {
            nom: outil.name,
            entreeJson,
          })
          await ctx.runMutation(internal.modules.copilot.conversations.journaliser, {
            conversationId: args.conversationId,
            requestId: args.requestId,
            evenement: lecture.ok ? "outil" : "outil_refuse",
            outil: outil.name,
            detail: lecture.ok ? `${lecture.sources.length} source(s)` : lecture.message,
            dureeMs: Date.now() - debutOutil,
          })
          if (lecture.ok) {
            outilsTraces.push({ nom: outil.name, libelle: outil.label, statut: "ok" })
            sources.push(...lecture.sources)
            resultats.push({
              ...appel,
              output: { status: "ok", source: outil.label, donnees: JSON.parse(lecture.donneesJson) as unknown },
            })
          } else {
            outilsTraces.push({ nom: outil.name, libelle: outil.label, statut: "refuse" })
            resultats.push({ ...appel, output: { status: "error", message: lecture.message } })
          }
        }
      }

      let texte = flux.texte().trim()
      if (!texte) texte = REPONSE_INACHEVEE
      else if (!fini) texte = `${texte}\n\n${REPONSE_INACHEVEE}`
      await ctx.runMutation(internal.modules.copilot.conversations.terminerTour, {
        messageId,
        contenu: texte,
        sources: fusionnerSources(sources).map((source) => ({
          outil: source.outil,
          libelle: source.libelle,
          ...(source.detail ? { detail: source.detail } : {}),
          ...(source.lien ? { lien: source.lien } : {}),
        })),
        outils: outilsTraces,
        tokensEntree,
        tokensSortie,
        dureeMs: Date.now() - debut,
      })
      return { etat: "termine", messageId }
    } catch (error) {
      const message = libelleErreur(error)
      const detail = error instanceof Error ? error.message.replace(/\s+/g, " ") : String(error)
      await ctx.runMutation(internal.modules.copilot.conversations.echouerTour, {
        messageId,
        contenu: flux.texte(),
        erreur: message,
        detail,
        outils: outilsTraces,
      })
      return { etat: "erreur", messageId, message }
    }
  },
})
