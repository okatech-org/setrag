import type { Permission, ProtectedResource } from "../../model/permissions"

export const COTRAF_RESOURCE = "cotraf" as const satisfies ProtectedResource
export const COTRAF_DASHBOARD_PERMISSION =
  "consulter" as const satisfies Permission
