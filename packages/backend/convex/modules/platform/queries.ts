import { v } from "convex/values"

import { query } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import { APP_ROLES } from "../../model/permissions"
import { evaluateModuleAccess, latestModuleAccessGrant } from "./model"
import {
  MODULE_MANIFEST,
  moduleManifestEntry,
  type ModuleCode,
} from "./catalog"
import { moduleCodeValidator } from "./validators"

export const getMyModuleAccess = query({
  args: {
    moduleCode: moduleCodeValidator,
    siteId: v.optional(v.id("sites")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const module = moduleManifestEntry(args.moduleCode)
    const access = await evaluateModuleAccess(
      ctx,
      user,
      args.moduleCode,
      args.siteId
    )
    return {
      code: module.code,
      label: module.label,
      route: module.route,
      resource: module.resource,
      ...access,
    }
  },
})

export const listMyModules = query({
  args: {},
  handler: async (ctx): Promise<ModuleCode[]> => {
    const user = await requireUser(ctx)
    const decisions = await Promise.all(
      MODULE_MANIFEST.map(async (module) => ({
        code: module.code,
        access: await evaluateModuleAccess(ctx, user, module.code),
      }))
    )
    return decisions
      .filter(({ access }) => access.canAccess)
      .map(({ code }) => code)
  },
})

/** Décisions détaillées, dans l'ordre stable du manifeste partagé. */
export const listMyModuleAccesses = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await Promise.all(
      MODULE_MANIFEST.map(async (module) => ({
        code: module.code,
        label: module.label,
        route: module.route,
        resource: module.resource,
        ...(await evaluateModuleAccess(ctx, user, module.code)),
      }))
    )
  },
})

/**
 * Matrice d'administration du DSI et des administrateurs délégués. Pour ces
 * derniers, seuls les modules qu'ils administrent sont exposés.
 */
export const listModuleAccessAdministration = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx)
    const actorDecisions = await Promise.all(
      MODULE_MANIFEST.map(async (module) => ({
        module,
        access: await evaluateModuleAccess(ctx, actor, module.code),
      }))
    )
    const administeredModules = actorDecisions
      .filter(
        ({ access }) =>
          actor.role === "admin_it" || access.accessLevel === "admin"
      )
      .map(({ module }) => module)
    if (administeredModules.length === 0) {
      throw new Error("Accès refusé : aucun module administrable.")
    }
    // Le personnel seulement, lu rôle par rôle : un voyageur n'a aucun accès
    // modulaire, et parcourir toute la clientèle dépasserait vite la limite
    // de lecture d'une requête.
    const userDocuments = (
      await Promise.all(
        APP_ROLES.filter((role) => role !== "voyageur").map((role) =>
          ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", role))
            .collect()
        )
      )
    ).flat()
    const users = userDocuments.map((user) => ({
      userId: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      matricule: user.matricule,
      role: user.role,
      isActive: user.isActive,
    }))
    const cells = (
      await Promise.all(
        userDocuments.map(
          async (user) =>
            await Promise.all(
              administeredModules.map(async (module) => {
                const [access, direct] = await Promise.all([
                  evaluateModuleAccess(ctx, user, module.code),
                  latestModuleAccessGrant(ctx, user._id, module.code),
                ])
                return {
                  userId: user._id,
                  moduleCode: module.code,
                  accessLevel: access.accessLevel,
                  accessSource: access.accessSource,
                  enabled: access.enabled,
                  canAccess: access.canAccess,
                  hasDirectGrant: direct !== null,
                  directAccessLevel: direct?.accessLevel ?? null,
                  ...(direct
                    ? {
                        directReason: direct.reason,
                        directGrantedBy: direct.grantedBy,
                        directUpdatedAt: direct.updatedAt,
                      }
                    : {}),
                }
              })
            )
        )
      )
    ).flat()

    return {
      modules: administeredModules.map((module) => ({ ...module })),
      users,
      cells,
    }
  },
})
