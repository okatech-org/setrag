import { useEffect, useState, type ReactNode } from "react"
import { Animated, Easing, Pressable, View } from "react-native"
import { Check } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { Ruban, RubanProgressif, useMouvementReduit } from "@workspace/mobile-ui/marque"
import { colors, fonts, motion } from "@workspace/mobile-ui/tokens"

import { Rond } from "./elements"
import { typo } from "./typo"

const glisse = Easing.bezier(...motion.easing.glisse)

const ETAPES = ["Trajet", "Voyageurs", "Paiement", "Billet"]

/**
 * Étapes du tunnel (`.etapes.m-etapes`) : quatre gares sur une voie ; le
 * ruban avance d'une gare quand on arrive sur l'écran (480 ms).
 */
export function Etapes({ courante }: { courante: number }) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const n = ETAPES.length
  const marge = largeur / n / 2
  const piste = largeur - largeur / n

  return (
    <View
      accessible
      accessibilityLabel={`Étape ${courante + 1} sur ${n} : ${ETAPES[courante]}`}
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", paddingTop: 2, paddingBottom: 4 }}
    >
      {largeur > 0 ? (
        <>
          <View style={{ position: "absolute", top: 8, left: marge, width: piste, height: 5, borderRadius: 3, backgroundColor: theme.colors.line }} />
          <View style={{ position: "absolute", top: 8, left: marge }}>
            <RubanEtapes piste={piste} courante={courante} n={n} reduit={reduit} />
          </View>
        </>
      ) : null}
      {ETAPES.map((nom, index) => {
        const faite = index < courante
        const ici = index === courante
        return (
          <View key={nom} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2.5,
                borderColor: faite || ici ? theme.colors.accent : theme.colors.lineStrong,
                backgroundColor: faite ? theme.colors.accent : theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {faite ? <Check size={10} strokeWidth={3.5} color={colors.light.surface} /> : null}
            </View>
            <Text
              style={{
                fontFamily: ici ? fonts.bold : fonts.medium,
                fontSize: 11,
                lineHeight: 14,
                color: ici ? theme.colors.ink : theme.colors.inkMuted,
              }}
            >
              {nom}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Le ruban des étapes : il part de la gare précédente et avance d'une gare
 * à l'arrivée sur l'écran.
 */
function RubanEtapes({ piste, courante, n, reduit }: { piste: number; courante: number; n: number; reduit: boolean }) {
  const theme = useTheme()
  const [progression, setProgression] = useState(Math.max(0, courante - 1) / (n - 1))
  useEffect(() => {
    const depart = setTimeout(() => setProgression(courante / (n - 1)), 60)
    return () => clearTimeout(depart)
  }, [courante, n])
  return <RubanProgressif largeur={piste} hauteur={5} rayon={3} progression={progression} teinte={theme.isDark ? "sombre" : "clair"} duree={reduit ? 0 : motion.durationGlisse} />
}

export type Jour = { jour: string; semaine: string; quantieme: string; prix: string; meilleur?: boolean; complet?: boolean }

/**
 * Bande des jours (`.jours.m-jours`) : cinq jours, le prix le plus bas de
 * chacun ; le ruban glisse sous le jour choisi.
 */
export function BandeJours({ jours, choisi, onChoisir }: { jours: Jour[]; choisi: string; onChoisir: (jour: string) => void }) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const index = Math.max(0, jours.findIndex((item) => item.jour === choisi))
  const [position] = useState(() => new Animated.Value(index))
  const colonne = jours.length ? largeur / jours.length : 0

  useEffect(() => {
    const animation = Animated.timing(position, { toValue: index, duration: reduit ? 0 : motion.durationGlisse, easing: glisse, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [position, index, reduit])

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Jour du voyage"
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        overflow: "hidden",
      }}
    >
      {jours.map((item, position) => {
        const actif = item.jour === choisi
        return (
          <Pressable
            key={item.jour}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif }}
            accessibilityLabel={`${item.semaine} ${item.quantieme}, ${item.complet ? "complet" : item.prix ? `dès ${item.prix} francs` : "aucun train"}${item.meilleur ? ", meilleur prix" : ""}`}
            onPress={() => onChoisir(item.jour)}
            style={{
              flex: 1,
              minHeight: 64,
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              paddingTop: 8,
              paddingBottom: 10,
              paddingHorizontal: 2,
              borderLeftWidth: position === 0 ? 0 : 1,
              borderLeftColor: theme.colors.line,
            }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 15, color: theme.colors.inkMuted }}>{item.semaine}</Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: actif ? theme.colors.accentInk : theme.colors.ink }}>{item.quantieme}</Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: item.meilleur ? fonts.monoSemibold : fonts.monoMedium,
                fontSize: 11.5,
                lineHeight: 15,
                color: item.complet ? theme.colors.inkFaint : item.meilleur ? theme.colors.successInk : theme.colors.inkMuted,
              }}
            >
              {item.complet ? "complet" : item.prix || "—"}
            </Text>
          </Pressable>
        )
      })}
      {colonne > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: colonne,
            height: 3,
            transform: [{ translateX: position.interpolate({ inputRange: [0, Math.max(1, jours.length - 1)], outputRange: [0, Math.max(1, jours.length - 1) * colonne] }) }],
          }}
        >
          <Ruban teinte={theme.isDark ? "sombre" : "clair"} rayon={0} style={{ flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
        </Animated.View>
      ) : null}
    </View>
  )
}

/** Puce de filtre (`.puce-filtre`). */
export function PuceFiltre({ libelle, actif, icone, onPress }: { libelle: string; actif: boolean; icone?: ReactNode; onPress: () => void }) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      onPress={onPress}
      hitSlop={{ top: 5, bottom: 5 }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: actif ? theme.colors.accentLine : theme.colors.lineStrong,
        backgroundColor: actif ? theme.colors.accentSoft : theme.colors.surface,
      }}
    >
      {icone}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: actif ? theme.colors.accentInk : theme.colors.ink }}>{libelle}</Text>
    </Pressable>
  )
}

/** Option radio en carte (`.classe`, `.moyen`) : contour accent quand elle est choisie. */
export function OptionRadio({
  coche,
  onPress,
  titre,
  precision,
  droite,
  desactive,
  hauteurMin = 60,
  accessibilite,
}: {
  coche: boolean
  onPress: () => void
  titre: string
  precision?: string
  droite?: ReactNode
  desactive?: boolean
  hauteurMin?: number
  accessibilite?: string
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: coche, disabled: desactive }}
      accessibilityLabel={accessibilite}
      disabled={desactive}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: hauteurMin,
        paddingVertical: 12,
        paddingHorizontal: coche ? 15 : 16,
        borderRadius: theme.radius.md,
        borderWidth: coche ? 2 : 1,
        borderColor: coche ? theme.colors.accent : theme.colors.line,
        backgroundColor: theme.colors.surface,
        opacity: desactive ? 0.5 : 1,
      }}
    >
      <Rond coche={coche} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: theme.colors.ink }}>{titre}</Text>
        {precision ? <Text style={[typo.petit, { color: theme.colors.inkMuted }]}>{precision}</Text> : null}
      </View>
      {droite}
    </Pressable>
  )
}

/** Marque d'un moyen de paiement, dans son cartouche (`.moyen .marque`). */
export function MarquePaiement({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 44,
        height: 30,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.surfaceSunk,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {typeof children === "string" ? (
        <Text style={{ fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.2, color: theme.colors.inkMuted }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  )
}
