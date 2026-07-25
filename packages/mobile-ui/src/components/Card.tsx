import { View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"

export interface CardProps extends ViewProps {
  padded?: boolean
  /** `sunk` pour une sous-carte posée sur une surface déjà blanche. */
  tone?: "surface" | "sunk"
  elevated?: boolean
}

export function Card({
  padded = true,
  tone = "surface",
  elevated = false,
  style,
  ...props
}: CardProps) {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          backgroundColor:
            tone === "sunk" ? theme.colors.surfaceSunk : theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: padded ? theme.spacing[6] : 0,
          gap: theme.spacing[4],
        },
        elevated && theme.shadows.md,
        style,
      ]}
      {...props}
    />
  )
}
