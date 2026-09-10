import { readFile } from "node:fs/promises"
import path from "node:path"

import { ConvexHttpClient } from "convex/browser"

import { api } from "@workspace/backend/generated"
import { isInternalRole } from "@workspace/backend/permissions"

import { asAppRole } from "@/lib/portal-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Les études vivent hors de `public/` : ce gestionnaire est leur seul point de
 * sortie. Better Auth étant servi par Convex en cross-domain, Next ne voit
 * aucun cookie ; le navigateur envoie le jeton Convex et c'est Convex qui le
 * valide en résolvant le profil.
 */
const DOCUMENTS_DIR = path.join(process.cwd(), "documents")
const FILE_NAME = /^[A-Z0-9_]+\.(pdf|md)$/
const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

const CONTENT_TYPES = {
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
} as const

async function isStaffToken(token: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) return false
  const client = new ConvexHttpClient(convexUrl)
  client.setAuth(token)
  try {
    const profile = await client.query(api.functions.customers.me, {})
    const role = asAppRole(profile?.user.role)
    return Boolean(role && profile?.user.isActive && isInternalRole(role))
  } catch {
    return false
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  if (!FILE_NAME.test(name)) {
    return new Response("Document introuvable", { status: 404 })
  }

  if (!E2E_MODE) {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
    if (!token) {
      return new Response("Authentification requise", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      })
    }
    if (!(await isStaffToken(token))) {
      return new Response("Réservé au personnel SETRAG", { status: 403 })
    }
  }

  const extension = name.slice(name.lastIndexOf(".") + 1) as "pdf" | "md"
  try {
    const body = await readFile(path.join(DOCUMENTS_DIR, name))
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension],
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return new Response("Document introuvable", { status: 404 })
  }
}
