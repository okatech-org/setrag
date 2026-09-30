import { FlaskConical } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"

export function DemoDataNotice({
  scope,
  children,
}: {
  scope: string
  children?: ReactNode
}) {
  return (
    <aside
      role="note"
      aria-label="Origine des données affichées"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/80 p-4 text-amber-950 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-bold">
            Données synthétiques de démonstration
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {scope} Ces informations illustrent des situations plausibles sur le
            Transgabonais ; elles ne proviennent pas des systèmes opérationnels
            de la SETRAG.
          </p>
          {children ? <div className="mt-1 text-xs">{children}</div> : null}
        </div>
      </div>
      <Badge
        variant="outline"
        className="w-fit shrink-0 border-amber-400 bg-white/70 text-amber-900"
      >
        SYNTHÉTIQUE · NON OFFICIEL
      </Badge>
    </aside>
  )
}
