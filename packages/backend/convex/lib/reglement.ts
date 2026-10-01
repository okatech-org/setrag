import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { paymentMethod } from "../schema"
import { MOYENS_A_DISTANCE, type MoyenPaiement } from "../model/caisse"

/**
 * Règlement d'une vente au guichet, quel que soit le produit.
 *
 * Trois familles de moyens :
 * - encaissés au comptoir (espèces, carte sur le TPE) : le vendeur constate
 *   le paiement lui-même, la vente s'écrit aussitôt ;
 * - à distance (Airtel Money, Moov Money, Click&Pay) : le client valide sur
 *   son téléphone ; la vente n'est écrite qu'après la confirmation de
 *   l'opérateur, portée par un paiement préalable ;
 * - en compte : un client conventionné est facturé en fin de mois, dans la
 *   limite de son plafond.
 */

/** Arguments de règlement acceptés par les mutations de vente du guichet. */
export const reglementArgs = {
  /** Moyen de règlement ; les espèces à défaut. */
  method: v.optional(paymentMethod),
  /** Espèces : montant remis par le client. */
  tendered: v.optional(v.number()),
  /** Moyen à distance : paiement confirmé par l'opérateur. */
  paymentId: v.optional(v.id("payments")),
  /** Ticket TPE, bon de commande… */
  reference: v.optional(v.string()),
  /** En compte : client conventionné facturé. */
  corporateAccountId: v.optional(v.id("corporateAccounts")),
}

export interface Reglement {
  method?: MoyenPaiement
  tendered?: number
  paymentId?: Id<"payments">
  reference?: string
  corporateAccountId?: Id<"corporateAccounts">
}

export interface ReglementVerifie {
  method: MoyenPaiement
  tendered?: number
  changeXaf?: number
  reference?: string
  payment?: Doc<"payments">
  account?: Doc<"corporateAccounts">
}

/** Erreur métier lisible au guichet, y compris en production. */
export function refus(message: string): never {
  throw new ConvexError(message)
}

/**
 * Vérifie le règlement avant toute écriture : un refus laisse la vente
 * intacte, dans la même transaction.
 */
export async function verifierReglement(
  ctx: MutationCtx,
  actor: Doc<"users">,
  reglement: Reglement,
  ttc: number
): Promise<ReglementVerifie> {
  const method = reglement.method ?? "especes"
  const reference = reglement.reference?.trim() || undefined

  if (method === "especes") {
    if (reglement.tendered === undefined) return { method, reference }
    if (!Number.isFinite(reglement.tendered) || reglement.tendered < 0) {
      refus(`Montant remis invalide : ${reglement.tendered}`)
    }
    if (reglement.tendered < ttc) {
      refus(
        `Montant reçu insuffisant : ${reglement.tendered} XAF remis pour ` +
          `${ttc} XAF dus`
      )
    }
    return {
      method,
      reference,
      tendered: reglement.tendered,
      changeXaf: Math.round((reglement.tendered - ttc) * 100) / 100,
    }
  }

  if (MOYENS_A_DISTANCE.includes(method)) {
    if (!reglement.paymentId) {
      refus("Paiement à distance sans confirmation de l'opérateur")
    }
    const payment = await ctx.db.get(reglement.paymentId)
    if (!payment || payment.requestedBy !== actor._id) {
      refus("Paiement introuvable pour ce guichet")
    }
    if (payment.status !== "confirme") {
      refus(`Paiement « ${payment.status} » : la vente attend sa confirmation`)
    }
    if (payment.saleId) refus("Ce paiement a déjà réglé une autre vente")
    if (payment.method !== method) {
      refus("Le moyen du paiement ne correspond pas à la vente")
    }
    if (payment.amountXaf !== ttc) {
      refus(
        `Paiement de ${payment.amountXaf} XAF pour une vente de ${ttc} XAF : ` +
          `le tarif a changé, refaites la demande`
      )
    }
    return { method, reference, payment }
  }

  if (method === "en_compte") {
    if (!reglement.corporateAccountId) {
      refus("Choisissez le client conventionné à facturer")
    }
    if (!reference) refus("Le numéro du bon de commande est obligatoire")
    const account = await ctx.db.get(reglement.corporateAccountId)
    if (!account || !account.isActive) {
      refus("Client conventionné inconnu ou suspendu")
    }
    if (account.outstandingXaf + ttc > account.creditLimitXaf) {
      refus(
        `Plafond du client ${account.name} dépassé : il reste ` +
          `${Math.max(0, account.creditLimitXaf - account.outstandingXaf)} XAF`
      )
    }
    return { method, reference, account }
  }

  // Carte bancaire : le TPE a autorisé la transaction, le ticket fait foi.
  return { method, reference }
}

function fournisseur(method: MoyenPaiement): string {
  if (method === "especes") return "guichet"
  if (method === "visa" || method === "mastercard") return "tpe"
  if (method === "en_compte") return "compte_client"
  return "simulation"
}

/**
 * Écrit le règlement d'une vente déjà insérée : ligne de paiement, encours
 * du client conventionné, moyen reporté sur la vente.
 */
export async function enregistrerReglement(
  ctx: MutationCtx,
  actor: Doc<"users">,
  saleId: Id<"sales">,
  reglement: ReglementVerifie,
  ttc: number
): Promise<Id<"payments">> {
  const now = Date.now()
  let paymentId: Id<"payments">
  if (reglement.payment) {
    paymentId = reglement.payment._id
    await ctx.db.patch(paymentId, { saleId })
  } else {
    paymentId = await ctx.db.insert("payments", {
      saleId,
      method: reglement.method,
      provider: fournisseur(reglement.method),
      status: "confirme",
      amountXaf: ttc,
      tenderedXaf: reglement.tendered,
      changeXaf: reglement.changeXaf,
      reference: reglement.reference,
      requestedBy: actor._id,
      settledAt: now,
    })
  }
  if (reglement.account) {
    await ctx.db.patch(reglement.account._id, {
      outstandingXaf: reglement.account.outstandingXaf + ttc,
    })
  }
  await ctx.db.patch(saleId, {
    paymentMethod: reglement.method,
    corporateAccountId: reglement.account?._id,
  })
  return paymentId
}
