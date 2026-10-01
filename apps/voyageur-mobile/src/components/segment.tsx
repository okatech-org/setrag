import { useEffect, useState } from "react"
import { Animated, Easing, Pressable, View } from "react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { useMouvementReduit } from "@workspace/mobile-ui/marque"
import { fonts, motion } from "@workspace/mobile-ui/tokens"

/** Segmenté (`.segment`) : le fond de l'option choisie glisse, en 320 ms. */
export function Segment<T extends string>({ options, valeur, onChange }: { options: { id: T; libelle: string }[]; valeur: T; onChange: (valeur: T) => void }) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const index = Math.max(0, options.findIndex((option) => option.id === valeur))
  const [position] = useState(() => new Animated.Value(index))
  const colonne = (largeur - 6 - 3 * (options.length - 1)) / options.length

  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: index,
      duration: reduit ? 0 : motion.durationSlow,
      easing: Easing.bezier(...motion.easing.glisse),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [position, index, reduit])

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", padding: 3, gap: 3, backgroundColor: theme.colors.surfaceSunk, borderRadius: 999 }}
    >
      {largeur > 0 ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: colonne,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            ...theme.shadows.sm,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: options.map((_, i) => i),
                  outputRange: options.map((_, i) => i * (colonne + 3)),
                }),
              },
            ],
          }}
        />
      ) : null}
      {options.map((option) => {
        const actif = option.id === valeur
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(option.id)}
            style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: actif ? theme.colors.ink : theme.colors.inkMuted }}>{option.libelle}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
