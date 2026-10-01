import { useEffect, useId, useState } from "react"
import { Animated, Easing, View, type ViewStyle } from "react-native"
import Svg, { Defs, Pattern, Rect } from "react-native-svg"

import { useTheme } from "../components/useTheme"
import { motion, surEncre } from "../tokens"
import { Ruban } from "./Ruban"
import { useMouvementReduit } from "./useMouvementReduit"

const glisse = Easing.bezier(...motion.easing.glisse)

export interface VoieProps {
  /** Part de la voie couverte par le ruban, de 0 à 1. Glisse à chaque changement. */
  progression?: number
  /** Une rame passe, sans fin, tant que dure une attente réelle. */
  attente?: boolean
  /** Voie posée sur le fond encre du billet. */
  surEncre?: boolean
  /** Durée du remplissage — 480 ms ; 720 ms pour l'émission d'un billet. */
  duree?: number
  style?: ViewStyle
}

/**
 * La voie : deux rails et des traverses, neutres — la structure. Le ruban
 * posé dessus est ce qui bouge. 14 pt de haut, la largeur du conteneur.
 */
export function Voie({ progression = 0, attente = false, surEncre: encre = false, duree = motion.durationGlisse, style }: VoieProps) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const rail = encre ? surEncre.rail : theme.colors.lineStrong
  const traverse = encre ? surEncre.traverse : theme.colors.line
  const teinte = encre || theme.isDark ? "sombre" : "clair"

  return (
    <View
      style={[{ height: 14, minWidth: 32, alignSelf: "stretch", overflow: "hidden" }, style]}
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Traverses couleur={traverse} sens="horizontal" />
      <View style={{ position: "absolute", left: 0, right: 0, top: 3, height: 1.5, backgroundColor: rail }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 9.5, height: 1.5, backgroundColor: rail }} />
      {largeur > 0 &&
        (attente ? (
          <Rame largeur={largeur} teinte={teinte} reduit={reduit} />
        ) : (
          <Remplissage largeur={largeur} progression={progression} teinte={teinte} duree={reduit ? 0 : duree} />
        ))}
    </View>
  )
}

function Remplissage({ largeur, progression, teinte, duree }: { largeur: number; progression: number; teinte: "clair" | "sombre"; duree: number }) {
  return (
    <View style={{ position: "absolute", left: 0, top: 3 }}>
      <RubanProgressif largeur={largeur} hauteur={8} progression={progression} teinte={teinte} duree={duree} />
    </View>
  )
}

export interface RubanProgressifProps {
  largeur: number
  hauteur: number
  /** Part couverte, de 0 à 1 ; glisse à chaque changement. */
  progression: number
  teinte: "clair" | "sombre"
  duree?: number
  rayon?: number
}

/**
 * Ruban qui avance sur une piste, depuis la gauche. L'animation passe par le
 * pilote natif (échelle et translation) : une largeur animée en JS ne se
 * redessine pas sur la nouvelle architecture.
 */
export function RubanProgressif({ largeur, hauteur, progression, teinte, duree = motion.durationGlisse, rayon = hauteur / 2 }: RubanProgressifProps) {
  const [valeur] = useState(() => new Animated.Value(progression))

  useEffect(() => {
    const animation = Animated.timing(valeur, { toValue: progression, duration: duree, easing: glisse, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [valeur, progression, duree])

  return (
    <View style={{ width: largeur, height: hauteur }}>
      <Animated.View
        style={{
          width: largeur,
          height: hauteur,
          // Mise à l'échelle depuis le bord gauche : le dégradé tient toujours dans la part couverte.
          transform: [
            { translateX: valeur.interpolate({ inputRange: [0, 1], outputRange: [-largeur / 2, 0] }) },
            { scaleX: valeur.interpolate({ inputRange: [0, 1], outputRange: [0.0001, 1] }) },
          ],
        }}
      >
        <Ruban teinte={teinte} rayon={rayon} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  )
}

function Rame({ largeur, teinte, reduit }: { largeur: number; teinte: "clair" | "sombre"; reduit: boolean }) {
  const [passage] = useState(() => new Animated.Value(0))
  const longueur = largeur * 0.34

  useEffect(() => {
    if (reduit) return
    const boucle = Animated.loop(
      Animated.timing(passage, { toValue: 1, duration: motion.durationBoucle, easing: glisse, useNativeDriver: true }),
    )
    boucle.start()
    return () => boucle.stop()
  }, [passage, reduit])

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: reduit ? largeur * 0.33 : 0,
        top: 3,
        height: 8,
        width: longueur,
        transform: reduit ? [] : [{ translateX: passage.interpolate({ inputRange: [0, 1], outputRange: [-longueur, longueur * 3] }) }],
      }}
    >
      <Ruban teinte={teinte} style={{ flex: 1 }} />
    </Animated.View>
  )
}

/** Traverses : un trait de 2 pt tous les 7 pt, sur toute l'épaisseur de la voie. */
export function Traverses({ couleur, sens }: { couleur: string; sens: "horizontal" | "vertical" }) {
  const id = `traverses-${useId().replace(/:/g, "")}`
  const horizontal = sens === "horizontal"

  return (
    <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={horizontal ? 7 : 14} height={horizontal ? 14 : 7}>
          <Rect x="0" y="0" width={horizontal ? 2 : 14} height={horizontal ? 14 : 2} fill={couleur} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  )
}

export interface VoieVerticaleProps {
  /** Tronçon déjà parcouru : rails neutres ; sinon rails accent. */
  passee?: boolean
  style?: ViewStyle
}

/** Voie verticale du suivi et du choix des gares — 14 pt de large. */
export function VoieVerticale({ passee = true, style }: VoieVerticaleProps) {
  const theme = useTheme()
  const rail = passee ? theme.colors.lineStrong : theme.colors.accentLine
  const traverse = passee ? theme.colors.line : theme.colors.accentSoft

  return (
    <View style={[{ position: "absolute", width: 14, overflow: "hidden" }, style]} pointerEvents="none">
      <Traverses couleur={traverse} sens="vertical" />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 3, width: 1.5, backgroundColor: rail }} />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 9.5, width: 1.5, backgroundColor: rail }} />
    </View>
  )
}
