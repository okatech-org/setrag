import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { assertPermission, requireUser } from "../../lib/auth"
import { DEMO_PERSONAS } from "../../model/demoPersonas"
import { isInternalRole } from "../../model/permissions"
import { estAuditeur } from "../etudes/model"
import { nomAffiche } from "../ged/acces"
import { assertCan } from "../platform/model"
import { OUTILS_COPILOT, type OutilCopilot } from "./model"

type Ctx = QueryCtx | MutationCtx

/** L'outil est-il ouvert à cet agent ? Ne lève jamais. */
export async function outilOuvert(ctx: Ctx, user: Doc<"users">, outil: OutilCopilot): Promise<boolean> {
  try {
    switch (outil.exigence.type) {
      case "aucune":
        return true
      case "interne":
        return isInternalRole(user.role)
      case "auditeur":
        return estAuditeur(user.role)
      case "ressource":
        for (const resource of outil.exigence.resources) {
          try {
            await assertPermission(ctx, user, resource, "consulter")
            return true
          } catch {
            // ressource suivante
          }
        }
        return false
      case "module":
        await assertCan(ctx, {
          moduleCode: outil.exigence.moduleCode,
          resource: outil.exigence.resource,
          permission: "consulter",
        })
        return true
    }
  } catch {
    return false
  }
}

export function libelleRole(role: Doc<"users">["role"]): string {
  return DEMO_PERSONAS.find((persona) => persona.role === role)?.label ?? role.replace(/_/g, " ")
}

/** Ce que Copilot sait de l'agent pour ce tour : identité et outils ouverts. */
export async function contexteAgent(ctx: Ctx) {
  const user = await requireUser(ctx)
  const ouverts: OutilCopilot[] = []
  const fermes: OutilCopilot[] = []
  for (const outil of OUTILS_COPILOT) {
    if (await outilOuvert(ctx, user, outil)) ouverts.push(outil)
    else fermes.push(outil)
  }
  return { user, nom: nomAffiche(user), roleLibelle: libelleRole(user.role), ouverts, fermes }
}

