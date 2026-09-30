import { CloudUploadIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Les trois chiffres de la tournée : le chiffre en mono, le mot dessous —
 * jamais la teinte seule. « À envoyer » a son icône et son fond d'attente.
 */
export function Compteurs({
  controles,
  attendus,
  aEnvoyer,
}: {
  controles: number
  attendus: number
  aEnvoyer: number
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Compteur valeur={controles} libelle="contrôlés" />
      <Compteur valeur={attendus} libelle="attendus" />
      <Compteur valeur={aEnvoyer} libelle="à envoyer" attente={aEnvoyer > 0} />
    </div>
  )
}

function Compteur({
  valeur,
  libelle,
  attente,
}: {
  valeur: number
  libelle: string
  attente?: boolean
}) {
  return (
    <div
      className={cn(
        "grid gap-0.5 rounded-md border px-3 py-2.5",
        attente
          ? "border-transparent bg-warning-soft text-warning-ink"
          : "border-line bg-surface"
      )}
    >
      <b className="font-mono text-[26px] leading-[1.05] font-semibold tabular-nums">
        {valeur}
      </b>
      <span
        className={cn(
          "flex items-center gap-1 text-[12.5px] font-medium",
          attente ? "text-warning-ink" : "text-ink-muted"
        )}
      >
        {libelle === "à envoyer" && (
          <CloudUploadIcon aria-hidden className="size-3.5" />
        )}
        {libelle}
      </span>
    </div>
  )
}
