import type { TextStyle } from "react-native"

import { fonts } from "@workspace/mobile-ui/tokens"

/**
 * Corps de texte des maquettes (`mobile.css`, `ui.css`), au point près.
 * Les couleurs se posent à l'usage, depuis le thème.
 */
export const typo = {
  grandTitre: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.28 },
  titreBarre: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20 },
  sousTitreBarre: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16 },
  sous: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  etiquette: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.72, textTransform: "uppercase" },
  titreSection: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  lienSection: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  lien: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  total: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 },
  legende: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  ligne: { fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 19 },
  ligneFin: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
  petit: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  gras15: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  heure: { fontFamily: fonts.monoSemibold, fontSize: 22, lineHeight: 24, fontVariant: ["tabular-nums"] },
  heureMono: { fontFamily: fonts.monoSemibold, fontSize: 14, lineHeight: 18, fontVariant: ["tabular-nums"] },
  mono12: { fontFamily: fonts.monoMedium, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  mono13: { fontFamily: fonts.monoMedium, fontSize: 13, lineHeight: 17, fontVariant: ["tabular-nums"] },
  gare: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
} satisfies Record<string, TextStyle>
