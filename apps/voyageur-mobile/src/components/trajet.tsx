import { useEffect, useState, type ReactNode } from "react"
import { Animated, Easing, Pressable, View, type ViewStyle } from "react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { useMouvementReduit, Voie } from "@workspace/mobile-ui/marque"
import { fonts, motion } from "@workspace/mobile-ui/tokens"
import { formatTime, spellTime } from "@workspace/shared/utils/format"

import { joursDecales } from "@/lib/format"
import { typo } from "./typo"

type Couleurs = { heure: string; gare: string; milieu: string }

/**
 * Heures d'un trajet (`.trajet-heures`) : départ, voie, arrivée. L'heure
 * d'abord, en mono ; la gare dessous ; au milieu la voie et sa légende.
 */
export function TrajetHeures({
  departAt,
  arriveeAt,
  gareDepart,
  gareArrivee,
  milieu,
  progression = 0,
  taille = 22,
  barre,
  surEncre,
  couleurs,
}: {
  departAt: number
  arriveeAt: number
  gareDepart: string
  gareArrivee: string
  /** Légende sous la voie : durée, arrêts, train. */
  milieu?: string
  progression?: number
  taille?: number
  /** Heures barrées : desserte supprimée. */
  barre?: boolean
  surEncre?: boolean
  couleurs?: Partial<Couleurs>
}) {
  const theme = useTheme()
  const teintes: Couleurs = {
    heure: couleurs?.heure ?? theme.colors.ink,
    gare: couleurs?.gare ?? theme.colors.inkMuted,
    milieu: couleurs?.milieu ?? theme.colors.inkMuted,
  }
  const decalage = joursDecales(departAt, arriveeAt)

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      accessible
      accessibilityLabel={`Départ de ${gareDepart} à ${spellTime(departAt, "fr-FR")}, arrivée à ${gareArrivee} à ${spellTime(arriveeAt, "fr-FR")}${decalage ? ` le lendemain` : ""}${milieu ? `, ${milieu}` : ""}`}
    >
      <Point heure={formatTime(departAt, "fr-FR")} gare={gareDepart} taille={taille} barre={barre} teintes={teintes} />
      <View style={{ flex: 1, alignItems: "center", gap: 5 }}>
        <Voie progression={progression} surEncre={surEncre} style={{ alignSelf: "stretch" }} />
        {milieu ? (
          <Text style={[typo.mono12, { color: teintes.milieu }]} numberOfLines={1}>
            {milieu}
          </Text>
        ) : null}
      </View>
      <Point heure={formatTime(arriveeAt, "fr-FR")} gare={gareArrivee} taille={taille} barre={barre} teintes={teintes} fin decalage={decalage} />
    </View>
  )
}

function Point({
  heure,
  gare,
  taille,
  barre,
  teintes,
  fin,
  decalage = 0,
}: {
  heure: string
  gare: string
  taille: number
  barre?: boolean
  teintes: Couleurs
  fin?: boolean
  decalage?: number
}) {
  return (
    <View style={{ alignItems: fin ? "flex-end" : "flex-start", maxWidth: "38%" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text
          style={{
            fontFamily: fonts.monoSemibold,
            fontSize: taille,
            lineHeight: taille + 2,
            color: teintes.heure,
            fontVariant: ["tabular-nums"],
            textDecorationLine: barre ? "line-through" : "none",
          }}
        >
          {heure}
        </Text>
        {decalage > 0 ? <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11, lineHeight: 13, color: teintes.gare, marginLeft: 2 }}>+{decalage}</Text> : null}
      </View>
      <Text style={[typo.gare, { color: teintes.gare, marginTop: 5 }]} numberOfLines={1}>
        {gare}
      </Text>
    </View>
  )
}

/** Apparition en cascade courte : 28 ms par carte, 6 pt de montée (`.apparait`). */
export function Apparition({ index, children, style }: { index: number; children: ReactNode; style?: ViewStyle }) {
  const reduit = useMouvementReduit()
  const [valeur] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.timing(valeur, {
      toValue: 1,
      duration: reduit ? 0 : motion.durationBase,
      delay: reduit ? 0 : Math.min(index, 5) * 28,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [valeur, index, reduit])

  return (
    <Animated.View
      style={[
        { opacity: valeur, transform: [{ translateY: valeur.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}

/**
 * Carte de trajet mobile (`.trajet.m`) : l'heure d'abord, le prix ensuite,
 * le reste en gris. Choisie, sa voie se remplit du ruban.
 */
export function CarteTrajet({
  departAt,
  arriveeAt,
  gareDepart,
  gareArrivee,
  milieu,
  pastilles,
  classes,
  prix,
  annule,
  choisi,
  onPress,
}: {
  departAt: number
  arriveeAt: number
  gareDepart: string
  gareArrivee: string
  milieu?: string
  pastilles: ReactNode
  /** « 2e · 1re · VIP » */
  classes?: string
  /** « dès 32 500 XAF » */
  prix?: string
  annule?: boolean
  choisi?: boolean
  onPress?: () => void
}) {
  const theme = useTheme()
  const contenu = (
    <>
      <TrajetHeures
        departAt={departAt}
        arriveeAt={arriveeAt}
        gareDepart={gareDepart}
        gareArrivee={gareArrivee}
        milieu={milieu}
        progression={choisi ? 1 : 0}
        barre={annule}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{pastilles}</View>
      {!annule && (classes || prix) ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderTopWidth: 1,
            borderTopColor: theme.colors.line,
            paddingTop: 12,
          }}
        >
          <Text style={[typo.legende, { color: theme.colors.inkMuted }]}>{classes}</Text>
          {prix ? <Text style={{ fontFamily: fonts.bold, fontSize: 21, lineHeight: 26, color: theme.colors.ink }}>{prix}</Text> : null}
        </View>
      ) : null}
    </>
  )
  const style: ViewStyle = {
    gap: 12,
    // Le filet s'épaissit sans décaler le contenu.
    padding: choisi ? 15 : 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: choisi ? 2 : 1,
    borderColor: choisi ? theme.colors.accent : theme.colors.line,
    opacity: annule ? 0.72 : 1,
  }

  if (!onPress || annule) return <View style={style}>{contenu}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: choisi }}
      accessibilityHint="Choisir ce train"
      onPress={onPress}
      style={({ pressed }) => [style, pressed && !choisi && { borderColor: theme.colors.lineStrong }]}
    >
      {contenu}
    </Pressable>
  )
}
