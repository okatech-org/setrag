import { useEffect, useState } from "react"
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native"

import { motion } from "../tokens"
import { Ruban } from "../marque/Ruban"
import { useMouvementReduit } from "../marque/useMouvementReduit"
import { useTheme } from "./useTheme"
import { Text } from "./Text"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  title: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
  icon?: React.ReactNode
  block?: boolean
  style?: ViewStyle
}

/**
 * Bouton SETRAG — pill, hauteurs 36 / 44 / 52 (`.btn` de la charte).
 * Un seul bouton `primary` par écran : celui qui fait avancer le voyage.
 * En cours, le libellé reste et un ruban fin passe sous lui.
 */
export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  icon,
  block = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const theme = useTheme()
  const isDisabled = disabled || loading

  const height = theme.controlHeight[size]
  const paddingHorizontal = { sm: 16, md: 20, lg: 24 }[size]
  const fontSize = { sm: 14, md: 15, lg: 16 }[size]

  const palette: Record<
    ButtonVariant,
    { background: string; border: string; label: string }
  > = {
    primary: {
      background: theme.colors.accent,
      border: "transparent",
      label: theme.colors.inkInverse,
    },
    secondary: {
      background: theme.colors.surface,
      border: theme.colors.accentLine,
      label: theme.colors.accentInk,
    },
    ghost: {
      background: "transparent",
      border: "transparent",
      label: theme.colors.accentInk,
    },
    danger: {
      background: theme.colors.surface,
      border: theme.colors.danger,
      label: theme.colors.dangerInk,
    },
  }

  const tone = palette[variant]
  const bordered = variant === "secondary" || variant === "danger"
  // En cours, le bouton garde sa couleur : seul le ruban dit qu'on attend.
  const inactive = disabled && !loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal,
          borderRadius: theme.radius.pill,
          backgroundColor: inactive
            ? variant === "ghost"
              ? "transparent"
              : theme.colors.surfaceSunk
            : tone.background,
          borderWidth: bordered ? 1 : 0,
          borderColor: inactive ? theme.colors.line : tone.border,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          alignSelf: block ? "stretch" : "flex-start",
        },
        style,
      ]}
      {...props}
    >
      <View style={styles.content}>
        {icon}
        <Text
          variant="body"
          style={{
            fontSize,
            lineHeight: fontSize + 4,
            fontFamily: theme.typography.h4.fontFamily,
            color: inactive ? theme.colors.inkFaint : tone.label,
          }}
        >
          {loading ? (loadingLabel ?? title) : title}
        </Text>
      </View>
      {loading && <RubanEnCours teinte={variant === "primary" ? "blanc" : theme.isDark ? "sombre" : "clair"} />}
    </Pressable>
  )
}

/** Un ruban de 3 pt passe sous le libellé, sans fin, tant que dure l'attente. */
function RubanEnCours({ teinte }: { teinte: "clair" | "sombre" | "blanc" }) {
  const reduit = useMouvementReduit()
  const [largeur, setLargeur] = useState(0)
  const [passage] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (reduit) return
    const boucle = Animated.loop(
      Animated.timing(passage, {
        toValue: 1,
        duration: motion.durationBoucle,
        easing: Easing.bezier(...motion.easing.glisse),
        useNativeDriver: true,
      })
    )
    boucle.start()
    return () => boucle.stop()
  }, [passage, reduit])

  const longueur = largeur * 0.34

  return (
    <View
      style={styles.piste}
      pointerEvents="none"
      onLayout={(event) => setLargeur(event.nativeEvent.layout.width)}
    >
      {largeur > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            height: 3,
            width: longueur,
            left: reduit ? largeur * 0.33 : 0,
            transform: reduit
              ? []
              : [
                  {
                    translateX: passage.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-longueur, longueur * 3],
                    }),
                  },
                ],
          }}
        >
          <Ruban teinte={teinte} rayon={3} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  piste: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
})
