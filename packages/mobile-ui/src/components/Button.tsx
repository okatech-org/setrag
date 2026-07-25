import { useEffect, useRef } from "react"
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native"

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
 * Bouton SETRAG — pill, hauteurs 36 / 44 / 52.
 * Un seul bouton `primary` par écran : celui qui fait avancer le voyage.
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
  const paddingHorizontal = { sm: 16, md: 20, lg: 28 }[size]
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
      border: theme.colors.ink,
      label: theme.colors.ink,
    },
    ghost: {
      background: "transparent",
      border: "transparent",
      label: theme.colors.accentInk,
    },
    danger: {
      background: theme.colors.danger,
      border: "transparent",
      label: theme.colors.inkInverse,
    },
  }

  const tone = palette[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal,
          borderRadius: theme.radius.pill,
          backgroundColor: isDisabled
            ? variant === "ghost" || variant === "secondary"
              ? "transparent"
              : theme.colors.line
            : tone.background,
          borderWidth: variant === "secondary" ? 1.5 : 0,
          borderColor: isDisabled ? theme.colors.line : tone.border,
          opacity: pressed && !isDisabled ? 0.9 : 1,
          transform: [{ translateY: pressed && !isDisabled ? 1 : 0 }],
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
            lineHeight: fontSize,
            fontFamily: theme.typography.h4.fontFamily,
            color: isDisabled ? theme.colors.inkFaint : tone.label,
          }}
        >
          {loading ? (loadingLabel ?? title) : title}
        </Text>
        {loading && <ProgressBar color={tone.label} />}
      </View>
    </Pressable>
  )
}

/** Barre indéterminée — conservée sous « animations réduites », comme la charte. */
function ProgressBar({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: true,
      })
    )
    animation.start()
    return () => animation.stop()
  }, [progress])

  return (
    <View style={[styles.track, { backgroundColor: `${color}59` }]}>
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: color,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-17, 42],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  track: {
    width: 42,
    height: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  thumb: {
    width: 17,
    height: 3,
    borderRadius: 999,
  },
})
