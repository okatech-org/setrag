import { useEffect, useState, type ComponentProps } from "react"
import { Animated, Easing, Pressable, View } from "react-native"
import { Tabs } from "expo-router"
import { CircleUserRound, House, Ticket } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { Ruban, useMouvementReduit } from "@workspace/mobile-ui/marque"
import { fonts, motion } from "@workspace/mobile-ui/tokens"

type BarreProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]

const ONGLETS: Record<string, { libelle: string; icone: typeof House }> = {
  index: { libelle: "Accueil", icone: House },
  billets: { libelle: "Billets", icone: Ticket },
  compte: { libelle: "Compte", icone: CircleUserRound },
}

const LARGEUR_RUBAN = 44

/** Barre d'onglets (`.onglets-m`) : le ruban suit l'onglet actif, en 480 ms. */
export function BarreOnglets({ state, navigation, insets }: BarreProps) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const colonne = largeur / state.routes.length
  const [position] = useState(() => new Animated.Value(state.index))

  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: state.index,
      duration: reduit ? 0 : motion.durationGlisse,
      easing: Easing.bezier(...motion.easing.glisse),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [position, state.index, reduit])

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {state.routes.map((route, index) => {
        const onglet = ONGLETS[route.name]
        if (!onglet) return null
        const actif = state.index === index
        const couleur = actif ? theme.colors.accentInk : theme.colors.inkMuted
        const Icone = onglet.icone
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={onglet.libelle}
            onPress={() => {
              const evenement = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
              if (!actif && !evenement.defaultPrevented) navigation.navigate(route.name, route.params)
            }}
            style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 3 }}
          >
            <Icone size={24} strokeWidth={1.9} color={couleur} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 11, lineHeight: 13, color: couleur }}>{onglet.libelle}</Text>
          </Pressable>
        )
      })}
      {largeur > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -1,
            left: 0,
            width: LARGEUR_RUBAN,
            height: 3,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: state.routes.map((_, index) => index),
                  outputRange: state.routes.map((_, index) => index * colonne + (colonne - LARGEUR_RUBAN) / 2),
                }),
              },
            ],
          }}
        >
          <Ruban teinte={theme.isDark ? "sombre" : "clair"} rayon={0} style={{ flex: 1, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
        </Animated.View>
      ) : null}
    </View>
  )
}
