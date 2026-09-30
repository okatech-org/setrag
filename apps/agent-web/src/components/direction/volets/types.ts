import type { ExecutiveOverviewDto } from "../executive-dto"
import type { PeriodPreset } from "../executive-period"

export interface ExecutiveVoletProps {
  data: ExecutiveOverviewDto
  preset: PeriodPreset
  /** Reçoit la valeur brute du contrôle ; la page la normalise et l'écrit dans l'URL. */
  onPresetChange: (value: string) => void
}
