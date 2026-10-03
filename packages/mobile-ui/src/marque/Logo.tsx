import { Platform } from "react-native"
import { SvgXml, type SvgProps } from "react-native-svg"

import { COMPACT, COMPACT_NEGATIF, SYMBOLE_MONO_BLANC, SYMBOLE_MONO_ENCRE, SYMBOLE_RUBAN } from "./logos"

const VARIANTES = {
  /** Logo sans signature, sur fond clair. */
  compact: { xml: COMPACT, ratio: 245 / 110 },
  /** Le même, sur fond sombre ou encre. */
  "compact-negatif": { xml: COMPACT_NEGATIF, ratio: 245 / 110 },
  /** Le S et son ruban : bouton et signe de Ruban. */
  "symbole-ruban": { xml: SYMBOLE_RUBAN, ratio: 84 / 110 },
  /** Le S seul, monochrome : états vides. */
  "symbole-encre": { xml: SYMBOLE_MONO_ENCRE, ratio: 76 / 98 },
  "symbole-blanc": { xml: SYMBOLE_MONO_BLANC, ratio: 76 / 98 },
} as const

export type LogoVariante = keyof typeof VARIANTES

export interface LogoProps {
  variante?: LogoVariante
  /** Hauteur en points ; la largeur suit le cadre du tracé. */
  hauteur?: number
  /** Masque le logo aux lecteurs d'écran quand un texte le double déjà. */
  decoratif?: boolean
}

/**
 * Logo SETRAG. Les tracés sont générés par `packages/ui/scripts/marque/generer.mjs`
 * — la même source que le web ; rien ne se redessine ici.
 */
export function Logo({ variante = "compact", hauteur = 30, decoratif = false }: LogoProps) {
  const { xml, ratio } = VARIANTES[variante]
  // SvgXml transforme les attributs aria-* du XML en camelCase. Le composant
  // porte donc l'accessibilité, avec les attributs propres à chaque plateforme.
  const xmlSansAccessibilite = xml.replace(/\s(?:role|aria-[\w-]+)="[^"]*"/g, "")
  const accessibilite: SvgProps = Platform.OS === "web"
    ? {
        role: decoratif ? undefined : "img",
        "aria-label": decoratif ? undefined : "SETRAG",
        "aria-hidden": decoratif,
      }
    : {
        accessible: !decoratif,
        accessibilityRole: decoratif ? undefined : "image",
        accessibilityLabel: decoratif ? undefined : "SETRAG",
        accessibilityElementsHidden: decoratif,
        importantForAccessibility: decoratif ? "no-hide-descendants" : "auto",
      }

  return (
    <SvgXml
      xml={xmlSansAccessibilite}
      width={hauteur * ratio}
      height={hauteur}
      {...accessibilite}
    />
  )
}
