import * as React from "react"
import { TrainFrontIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export interface Depart {
  cle: string
  heure: string
  /** Heure prévue, barrée sous l'heure réelle quand elle diffère. */
  heurePrevue?: string
  destination: string
  via?: string
  train: string
  quai?: string
  statut: React.ReactNode
}

/**
 * Tableau des départs, comme en gare : fond encre, heures en jaune du site.
 * Sur mobile, il se replie en lignes sans colonnes « train » ni « quai ».
 */
export function TableauDeparts({
  titre,
  horloge,
  departs,
  className,
}: {
  titre: React.ReactNode
  horloge?: string
  departs: Depart[]
  className?: string
}) {
  // Sans quai annoncé nulle part, la colonne n'apporterait que des tirets.
  const avecQuai = departs.some((d) => d.quai)
  return (
    // Fond encre : les pastilles y prennent les teintes du thème sombre.
    <section data-theme="dark" className={cn("overflow-hidden rounded-lg bg-brand-encre text-white", className)}>
      <header className="flex items-center gap-3 border-b border-[oklch(0.32_0.02_257)] px-5 py-3.5">
        <TrainFrontIcon className="size-5" aria-hidden />
        <h2 className="text-[16px] font-bold">{titre}</h2>
        {horloge && <span className="ml-auto font-mono text-[18px] font-semibold text-brand-jaune">{horloge}</span>}
      </header>
      <table className="w-full border-collapse">
        <thead className="max-md:sr-only">
          <tr className="text-left text-[11.5px] font-semibold tracking-[0.06em] text-[oklch(0.7_0.02_257)] uppercase">
            <th className="px-5 pt-2.5 pb-1.5">Heure</th>
            <th className="px-2 pt-2.5 pb-1.5">Destination</th>
            <th className="px-2 pt-2.5 pb-1.5 max-md:hidden">Train</th>
            {avecQuai && <th className="px-2 pt-2.5 pb-1.5 text-center max-md:hidden">Quai</th>}
            <th className="px-5 pt-2.5 pb-1.5">État</th>
          </tr>
        </thead>
        <tbody>
          {departs.map((d) => (
            <tr key={d.cle} className="border-t border-[oklch(0.28_0.02_257)] align-middle">
              <td className="w-[86px] py-3 pl-5 font-mono text-[20px] font-semibold text-brand-jaune tabular-nums">
                {d.heure}
                {d.heurePrevue && d.heurePrevue !== d.heure && <s className="block text-[12px] font-normal text-[oklch(0.6_0.02_257)]">{d.heurePrevue}</s>}
              </td>
              <td className="px-2 py-3">
                <b className="block text-[16px] font-bold">{d.destination}</b>
                {d.via && <small className="block truncate text-[12.5px] text-[oklch(0.72_0.02_257)]">{d.via}</small>}
                <small className="block text-[12.5px] text-[oklch(0.72_0.02_257)] md:hidden">
                  {d.train}
                  {d.quai && ` · quai ${d.quai}`}
                </small>
              </td>
              <td className="px-2 py-3 text-[15px] max-md:hidden">{d.train}</td>
              {avecQuai && <td className="px-2 py-3 text-center font-mono text-[18px] font-semibold max-md:hidden">{d.quai ?? "—"}</td>}
              <td className="py-3 pr-5 [&_[data-slot=tag]]:max-md:h-6">{d.statut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
