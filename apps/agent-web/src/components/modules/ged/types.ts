import type { GenericId } from "convex/values"

/** Identifiant Convex typé, sans dépendre d'un chemin non exporté du backend. */
export type Id<Table extends string> = GenericId<Table>
