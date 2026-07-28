"use node"

import { v } from "convex/values"

import { internal } from "../_generated/api"
import { action } from "../_generated/server"
import {
  createAppleWalletPass,
  createGoogleWalletUrl,
  type WalletTicketData,
} from "../lib/walletPass"

type WalletPassResult =
  | { provider: "google"; url: string }
  | {
      provider: "apple"
      filename: string
      bytes: ArrayBuffer
    }

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Le service Wallet n’est pas configuré (${name} manquant).`)
  }
  return value.replaceAll("\\n", "\n")
}

function requiredBase64Environment(name: string): string {
  return Buffer.from(requiredEnvironment(name), "base64").toString("utf8")
}

/**
 * Fabrique le titre Wallet à la demande après le même contrôle d'accès que le
 * PDF. Aucun secret de signature n'est transmis au navigateur.
 */
export const createPass = action({
  args: {
    ticketId: v.id("tickets"),
    provider: v.union(v.literal("apple"), v.literal("google")),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WalletPassResult> => {
    const data: WalletTicketData = await ctx.runQuery(
      internal.functions.documents.printData,
      {
        ticketId: args.ticketId,
        contactPhone: args.contactPhone,
      }
    )
    if (data.status !== "valide") {
      throw new Error("Seul un billet valide peut être ajouté au Wallet.")
    }

    if (args.provider === "google") {
      return {
        provider: "google" as const,
        url: createGoogleWalletUrl(data, {
          issuerId: requiredEnvironment("GOOGLE_WALLET_ISSUER_ID"),
          serviceAccountEmail: requiredEnvironment(
            "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL"
          ),
          privateKey: requiredBase64Environment(
            "GOOGLE_WALLET_PRIVATE_KEY_BASE64"
          ),
          siteUrl: requiredEnvironment("SITE_URL"),
        }),
      }
    }

    const pass = createAppleWalletPass(data, {
      passTypeIdentifier: requiredEnvironment("APPLE_WALLET_PASS_TYPE_ID"),
      teamIdentifier: requiredEnvironment("APPLE_WALLET_TEAM_ID"),
      signerCertificate: requiredEnvironment("APPLE_WALLET_SIGNER_CERTIFICATE"),
      signerPrivateKey: requiredEnvironment("APPLE_WALLET_SIGNER_PRIVATE_KEY"),
      wwdrCertificate: requiredEnvironment("APPLE_WALLET_WWDR_CERTIFICATE"),
    })
    return {
      provider: "apple" as const,
      filename: `billet-${data.number}.pkpass`,
      bytes: Uint8Array.from(pass).buffer,
    }
  },
})
