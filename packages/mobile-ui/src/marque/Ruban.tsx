import { useId } from "react"
import { View, type ViewStyle } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { RUBAN } from "../tokens"

export type RubanTeinte = keyof typeof RUBAN

export interface RubanProps {
  /** `clair` sur fond clair, `sombre` sur fond sombre ou encre, `blanc` sur bleu. */
  teinte?: RubanTeinte
  /** Dégradé vertical (rame du suivi) plutôt qu'horizontal. */
  vertical?: boolean
  rayon?: number
  style?: ViewStyle
}

/**
 * Le ruban — vert, jaune, bleu en tête. Il remplit son cadre : c'est le
 * conteneur qui en fixe la taille et la position.
 */
export function Ruban({ teinte = "clair", vertical = false, rayon = 4, style }: RubanProps) {
  const id = `ruban-${useId().replace(/:/g, "")}`

  return (
    <View style={[{ overflow: "hidden", borderRadius: rayon }, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
            {RUBAN[teinte].map(([offset, couleur]) => (
              <Stop key={offset} offset={offset} stopColor={couleur} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
