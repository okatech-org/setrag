import { query } from "../../_generated/server"
import { assertCan } from "../platform/model"
import { emptyFretDashboard } from "./model"
import { FRET_DASHBOARD_PERMISSION, FRET_RESOURCE } from "./permissions"

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const access = await assertCan(ctx, {
      moduleCode: "fret",
      resource: FRET_RESOURCE,
      permission: FRET_DASHBOARD_PERMISSION,
      allowScopedLanding: true,
    })
    return emptyFretDashboard(access.accessibleSiteIds)
  },
})
