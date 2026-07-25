import { Pressable, View, type ViewStyle } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export interface ToastBarProps {
  message: string
  actionLabel?: string
  onAction?: () => void
  style?: ViewStyle
}

/** Bandeau de confirmation — fond encre, action à droite. */
export function ToastBar({ message, actionLabel, onAction, style }: ToastBarProps) {
  const theme = useTheme()

  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3] + 2,
          backgroundColor: theme.colors.ink,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3] + 2,
        },
        theme.shadows.lg,
        style,
      ]}
    >
      <Text variant="body" tone="inverse" style={{ flex: 1, fontSize: 15 }}>
        {message}
      </Text>
      {actionLabel && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text
            style={{
              fontFamily: theme.typography.h4.fontFamily,
              fontSize: 14,
              lineHeight: 14,
              /* L'accent foncé tombe à 2,2:1 sur l'encre : on prend la teinte claire. */
              color: theme.colors.accentOnInk,
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
