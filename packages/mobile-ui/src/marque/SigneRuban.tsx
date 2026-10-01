import { useEffect, useId, useState } from "react"
import { Animated, Easing } from "react-native"
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg"

import { motion, RUBAN } from "../tokens"
import { S, S_LONGUEUR } from "./logos"
import { useMouvementReduit } from "./useMouvementReduit"

const CheminAnime = Animated.createAnimatedComponent(Path)

export type SigneEtat = "repos" | "reflexion"

export interface SigneRubanProps {
  /** `reflexion` : une rame parcourt le S, sur la trace pâle du S. */
  etat?: SigneEtat
  /** `sombre` éclaircit la tête du ruban pour un fond encre. */
  fond?: "clair" | "sombre"
  /** Hauteur en points ; la largeur suit (84 × 112). */
  hauteur?: number
}

/**
 * Le signe de Ruban, l'assistant SETRAG : le ruban posé en S, sans les rails.
 * SETRAG pose la voie, Ruban roule dessus.
 */
export function SigneRuban({ etat = "repos", fond = "sombre", hauteur = 35 }: SigneRubanProps) {
  const id = `signe-${useId().replace(/:/g, "")}`
  const reduit = useMouvementReduit()
  const [passage] = useState(() => new Animated.Value(0))
  const reflexion = etat === "reflexion" && !reduit

  useEffect(() => {
    if (!reflexion) return
    const boucle = Animated.loop(
      Animated.timing(passage, {
        toValue: 1,
        duration: motion.durationBoucle,
        easing: Easing.bezier(...motion.easing.glisse),
        useNativeDriver: false,
      })
    )
    boucle.start()
    return () => boucle.stop()
  }, [passage, reflexion])

  return (
    <Svg viewBox="8 -6 84 112" width={(hauteur * 84) / 112} height={hauteur} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="97">
          {RUBAN[fond].map(([offset, couleur]) => (
            <Stop key={offset} offset={offset} stopColor={couleur} />
          ))}
        </LinearGradient>
      </Defs>
      {reflexion ? (
        <>
          <Path d={S} fill="none" stroke={`url(#${id})`} strokeOpacity={0.16} strokeWidth={14} strokeLinecap="round" />
          <CheminAnime
            d={S}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={[0.34 * S_LONGUEUR, 2 * S_LONGUEUR]}
            strokeDashoffset={passage.interpolate({ inputRange: [0, 1], outputRange: [0.34 * S_LONGUEUR, -S_LONGUEUR] })}
          />
        </>
      ) : (
        <Path d={S} fill="none" stroke={`url(#${id})`} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  )
}
