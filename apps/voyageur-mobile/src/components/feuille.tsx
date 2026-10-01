import { useEffect, useState, type ReactNode } from "react"
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { X } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { useMouvementReduit } from "@workspace/mobile-ui/marque"
import { fonts, motion, voile } from "@workspace/mobile-ui/tokens"

/**
 * Feuille (`.feuille`) : monte du bas en 320 ms, sans rebond, sur un voile.
 * `hauteur` : `pleine` s'arrête à 96 pt du haut ; `auto` épouse son contenu.
 */
export function Feuille({
  visible,
  titre,
  onFermer,
  hauteur = "pleine",
  children,
}: {
  visible: boolean
  titre: string
  onFermer: () => void
  hauteur?: "pleine" | "auto"
  children: ReactNode
}) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [montee] = useState(() => new Animated.Value(0))
  const [monte, setMonte] = useState(visible)
  // Ouverte, la feuille est montée tout de suite ; fermée, démontée à la fin de sa descente.
  if (visible && !monte) setMonte(true)

  useEffect(() => {
    const animation = Animated.timing(montee, {
      toValue: visible ? 1 : 0,
      duration: reduit ? 0 : visible ? motion.durationSlow : motion.durationBase,
      easing: visible ? Easing.bezier(...motion.easing.standard) : Easing.bezier(...motion.easing.sortie),
      useNativeDriver: true,
    })
    animation.start(({ finished }) => {
      if (finished && !visible) setMonte(false)
    })
    return () => animation.stop()
  }, [visible, montee, reduit])

  return (
    <Modal visible={monte} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onFermer}>
      <Animated.View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: voile, opacity: montee }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onFermer} style={{ flex: 1 }} />
      </Animated.View>
      {/* Une feuille haute garde sa taille : sa liste défile sous le clavier. Seule une feuille courte remonte au-dessus. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" && hauteur === "auto" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={{
            height: hauteur === "pleine" ? height - 96 : undefined,
            maxHeight: height - 96,
            backgroundColor: theme.colors.canvas,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: hauteur === "auto" ? Math.max(insets.bottom, 16) : 0,
            ...theme.shadows.lg,
            transform: [{ translateY: montee.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.colors.lineStrong, alignSelf: "center", marginTop: 8, marginBottom: 4 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: theme.colors.ink }}>
              {titre}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={onFermer}
              hitSlop={4}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -4 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSunk }}>
                <X size={18} color={theme.colors.ink} />
              </View>
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
