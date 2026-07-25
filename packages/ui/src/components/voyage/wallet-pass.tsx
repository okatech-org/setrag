import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Aperçu d'une carte de wallet (Apple Wallet, Google Wallet).
 *
 * Ce composant ne produit pas le pass : celui-ci est signé côté serveur
 * (`.pkpass` pour Apple, objet REST pour Google). Il en restitue le rendu, pour
 * valider la charte avant émission et pour montrer au voyageur ce qu'il va
 * ajouter.
 *
 * L'agencement suit celui d'un `boardingPass` Apple de type train, car c'est le
 * plus contraint des deux : en-tête, deux champs principaux qui portent la
 * relation, puis les champs secondaires et auxiliaires. Google Wallet consomme
 * les mêmes données dans un gabarit plus libre.
 *
 * Contraintes reprises de la plateforme, à ne pas dépasser sous peine de
 * troncature côté iOS : 3 champs d'en-tête, 2 principaux, 4 secondaires,
 * 5 auxiliaires.
 */

export interface WalletField {
  label: string
  value: string
  /** Chiffres et heures : alignement mono, comme partout ailleurs. */
  mono?: boolean
}

export interface WalletPassProps extends React.ComponentProps<"div"> {
  /** Texte à côté du logo — « SETRAG » en général. */
  logoText?: string
  logo?: React.ReactNode
  headerFields?: WalletField[]
  /** Les deux bornes du trajet. Un `boardingPass` en accepte exactement deux. */
  origin: WalletField
  destination: WalletField
  secondaryFields?: WalletField[]
  auxiliaryFields?: WalletField[]
  qrCode?: React.ReactNode
  /** Message encodé dans le code-barres, affiché sous celui-ci. */
  barcodeAltText?: string
}

function WalletPass({
  logoText = "SETRAG",
  logo,
  headerFields = [],
  origin,
  destination,
  secondaryFields = [],
  auxiliaryFields = [],
  qrCode,
  barcodeAltText,
  className,
  ...props
}: WalletPassProps) {
  return (
    <div
      data-slot="wallet-pass"
      className={cn(
        "grid w-80 gap-5 overflow-hidden rounded-[16px] bg-accent-base p-5 text-ink-inverse shadow-lg",
        className
      )}
      {...props}
    >
      <header className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          {logo}
          <span className="text-[13px] leading-none font-semibold">
            {logoText}
          </span>
        </span>
        {headerFields.slice(0, 3).map((field) => (
          <PassField key={field.label} field={field} align="end" />
        ))}
      </header>

      <div className="flex items-end justify-between gap-3">
        <PassField field={origin} size="lg" />
        <span aria-hidden className="pb-1.5 text-[18px] leading-none opacity-70">
          →
        </span>
        <PassField field={destination} size="lg" align="end" />
      </div>

      {secondaryFields.length > 0 && (
        <div className="flex justify-between gap-3">
          {secondaryFields.slice(0, 4).map((field) => (
            <PassField key={field.label} field={field} />
          ))}
        </div>
      )}

      {auxiliaryFields.length > 0 && (
        <div className="flex justify-between gap-3">
          {auxiliaryFields.slice(0, 5).map((field) => (
            <PassField key={field.label} field={field} />
          ))}
        </div>
      )}

      {qrCode && (
        <div className="grid justify-items-center gap-2 rounded-[10px] bg-surface p-3">
          <div className="grid size-32 place-items-center">{qrCode}</div>
          {barcodeAltText && (
            <span className="tabular text-[11px] leading-none text-ink">
              {barcodeAltText}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PassField({
  field,
  size = "md",
  align = "start",
}: {
  field: WalletField
  size?: "md" | "lg"
  align?: "start" | "end"
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-1",
        align === "end" ? "justify-items-end text-right" : "justify-items-start"
      )}
    >
      <span className="text-[10px] leading-none font-semibold tracking-[0.08em] text-ink-inverse/75 uppercase">
        {field.label}
      </span>
      <span
        className={cn(
          "max-w-full truncate leading-none font-semibold",
          size === "lg" ? "text-[24px]" : "text-[15px]",
          field.mono && "tabular"
        )}
      >
        {field.value}
      </span>
    </div>
  )
}

export { WalletPass }
