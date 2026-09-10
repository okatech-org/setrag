import { v } from "convex/values"

import { query } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import { evaluateModuleAccess } from "./model"
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
