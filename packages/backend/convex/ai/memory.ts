import { v } from "convex/values"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { assertActiveUser, audit, loadActor, requireUser } from "../lib/auth"
import { toServiceDate } from "../model/calendar"
import {
  NOTES_PAR_COMPTE_MAX,
  NOTES_TRANSMISES_MAX,
  estCategorieNote,
  verifierNote,
  type CategorieNote,
} from "../model/memoire"
import { assistantMemoryCategory } from "../schema"

/**
 * Ce que Ruban retient d'un voyageur.
 *
 * Une note appartient à un COMPTE : elle est prise par l'outil `remember`
 * pour l'acteur résolu de la conversation (session du site ou de
 * l'application, messagerie reliée), et vaut partout où ce compte parle à
 * Ruban. Un invité n'a pas de notes : les outils sont réservés aux
 * conversations qui ont un acteur.
 *
 * Le voyageur voit ses notes et les efface (une à une ou toutes) depuis son
 * compte, ou en le demandant à Ruban. Chaque écriture est journalisée, sans
 * le contenu de la note : le journal survit à l'effacement du compte, une
 * donnée personnelle n'a pas à y rester.
 */

type SourceNote = Doc<"assistantMemories">["source"]

/** Ce que le voyageur (et le modèle) voit d'une note. */
function projeter(note: Doc<"assistantMemories">) {
  return {
    _id: note._id,
    category: note.category,
    content: note.content,
    source: note.source,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

async function notesDe(
  ctx: QueryCtx,
  userId: Id<"users">,
  limite: number
): Promise<Doc<"assistantMemories">[]> {
  return await ctx.db
    .query("assistantMemories")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limite)
}

/**
 * Les notes injectées dans les instructions de Ruban : les plus récentes,
 * bornées, sous une forme minimale. L'identifiant permet au modèle de
 * corriger ou d'oublier une note ; il ne l'affiche jamais.
 */
export async function notesPourContexte(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<
  Array<{ id: string; category: CategorieNote; note: string; notedOn: string }>
> {
  const notes = await notesDe(ctx, userId, NOTES_TRANSMISES_MAX)
  return notes.map((note) => ({
    id: note._id,
    category: note.category,
    note: note.content,
    notedOn: toServiceDate(note.updatedAt),
  }))
}

/**
 * Efface toutes les notes d'un compte. Le plafond par compte borne le
 * nombre de lignes : une seule transaction suffit.
 */
export async function effacerNotesDuCompte(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<number> {
  const notes = await ctx.db
    .query("assistantMemories")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
    .take(NOTES_PAR_COMPTE_MAX * 4)
  for (const note of notes) await ctx.db.delete(note._id)
  return notes.length
}

/** Une note du compte désignée par une chaîne venue du modèle, ou `null`. */
async function noteDuCompte(
  ctx: MutationCtx,
  user: Doc<"users">,
  memoryId: string
): Promise<Doc<"assistantMemories"> | null> {
  const id = ctx.db.normalizeId("assistantMemories", memoryId)
  if (!id) return null
  const note = await ctx.db.get(id)
  return note && note.userId === user._id ? note : null
}

async function retenir(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    category: CategorieNote
    content: string
    replacesMemoryId?: string
    source: SourceNote
  }
) {
  const verdict = verifierNote(args.content)
  if (!verdict.ok) throw new Error(verdict.raison)
  const now = Date.now()

  const remplacee = args.replacesMemoryId
    ? await noteDuCompte(ctx, user, args.replacesMemoryId)
    : null
  if (args.replacesMemoryId && !remplacee) {
    throw new Error("Note introuvable : rien n'a été modifié.")
  }
  const identique = await ctx.db
    .query("assistantMemories")
    .withIndex("by_user_and_content_key", (q) =>
      q.eq("userId", user._id).eq("contentKey", verdict.cle)
    )
    .first()

  // Déjà noté : on rafraîchit la note existante (elle remonte parmi les
  // plus récentes), sans doublon. Une note remplacée par un contenu déjà
  // présent disparaît au profit de celui-ci.
  const cible = identique ?? remplacee
  if (cible) {
    await ctx.db.patch(cible._id, {
      category: args.category,
      content: verdict.texte,
      contentKey: verdict.cle,
      source: args.source,
      updatedAt: now,
    })
    if (remplacee && identique && remplacee._id !== identique._id) {
      await ctx.db.delete(remplacee._id)
    }
    await audit(ctx, {
      actorId: user._id,
      action: "assistant_memoire.modifier",
      entityTable: "assistantMemories",
      entityId: cible._id,
      after: { category: args.category, source: args.source },
    })
    return {
      action: "noted" as const,
      memoryId: cible._id,
      category: args.category,
      content: verdict.texte,
      replaced: remplacee !== null,
    }
  }

  const memoryId = await ctx.db.insert("assistantMemories", {
    userId: user._id,
    category: args.category,
    content: verdict.texte,
    contentKey: verdict.cle,
    source: args.source,
    createdAt: now,
    updatedAt: now,
  })

  // Au-delà du plafond, les notes les plus anciennes cèdent la place : Ruban
  // se souvient des dernières choses importantes, pas de tout.
  const toutes = await ctx.db
    .query("assistantMemories")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(NOTES_PAR_COMPTE_MAX + 10)
  const evincees = toutes.slice(NOTES_PAR_COMPTE_MAX)
  for (const note of evincees) await ctx.db.delete(note._id)

  await audit(ctx, {
    actorId: user._id,
    action: "assistant_memoire.noter",
    entityTable: "assistantMemories",
    entityId: memoryId,
    after: {
      category: args.category,
      source: args.source,
      ...(evincees.length > 0 ? { evincees: evincees.length } : {}),
    },
  })
  return {
    action: "noted" as const,
    memoryId,
    category: args.category,
    content: verdict.texte,
    replaced: false,
  }
}

async function oublier(ctx: MutationCtx, user: Doc<"users">, memoryId: string) {
  const note = await noteDuCompte(ctx, user, memoryId)
  // Même réponse pour une note inconnue et pour la note d'un autre compte.
  if (!note) throw new Error("Note introuvable.")
  await ctx.db.delete(note._id)
  await audit(ctx, {
    actorId: user._id,
    action: "assistant_memoire.oublier",
    entityTable: "assistantMemories",
    entityId: note._id,
    before: { category: note.category },
  })
  return { action: "forgotten" as const, count: 1, content: note.content }
}

async function toutOublier(ctx: MutationCtx, user: Doc<"users">) {
  const count = await effacerNotesDuCompte(ctx, user._id)
  await audit(ctx, {
    actorId: user._id,
    action: "assistant_memoire.tout_oublier",
    entityTable: "users",
    entityId: user._id,
    after: { count },
  })
  return { action: "forgotten_all" as const, count }
}

/* ─────────────────────────── Fonctions publiques ─────────────────────────── */

/** Les notes du voyageur connecté, les plus récentes d'abord. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const notes = await notesDe(ctx, user._id, NOTES_PAR_COMPTE_MAX)
    return notes.map(projeter)
  },
})

/** Efface une note du voyageur connecté. */
export const forget = mutation({
  args: { memoryId: v.id("assistantMemories") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const resultat = await oublier(ctx, user, args.memoryId)
    return { count: resultat.count }
  },
})

/** Efface toutes les notes du voyageur connecté. */
export const forgetAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const resultat = await toutOublier(ctx, user)
    return { count: resultat.count }
  },
})

/* ──────────────── Variantes internes pour l'acteur d'une conversation ─────── */

/**
 * `remember` : l'acteur est résolu par `accessContext` (session ou fil de
 * messagerie relié) ; jamais un identifiant venu du client ou du modèle.
 */
export const rememberForActor = internalMutation({
  args: {
    userId: v.id("users"),
    category: assistantMemoryCategory,
    content: v.string(),
    replacesMemoryId: v.optional(v.string()),
    source: v.union(v.literal("session"), v.literal("messaging")),
  },
  handler: async (ctx, { userId, ...args }) => {
    const user = assertActiveUser(await loadActor(ctx, userId))
    if (!estCategorieNote(args.category)) throw new Error("Catégorie inconnue.")
    return await retenir(ctx, user, args)
  },
})

/** `forget` : une note désignée, ou toutes. */
export const forgetForActor = internalMutation({
  args: {
    userId: v.id("users"),
    memoryId: v.optional(v.string()),
    all: v.boolean(),
  },
  handler: async (ctx, { userId, memoryId, all }) => {
    const user = assertActiveUser(await loadActor(ctx, userId))
    if (all) return await toutOublier(ctx, user)
    if (!memoryId) throw new Error("Précisez la note à oublier.")
    return await oublier(ctx, user, memoryId)
  },
})
