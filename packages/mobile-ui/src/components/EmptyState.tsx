import { View, type ViewStyle } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export interface EmptyStateProps {
  title: string
  description?: string
  /** Toujours proposer une sortie : un jour voisin, un filtre à élargir. */
  action?: React.ReactNode
  style?: ViewStyle
}

export function EmptyState({ title, description, action, style }: EmptyStateProps) {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          alignItems: "center",
          gap: theme.spacing[2] + 2,
          padding: theme.spacing[6],
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: theme.colors.lineStrong,
        },
        style,
      ]}
    >
      <Text variant="h4" style={{ textAlign: "center" }}>{title}</Text>
      {description && (
        <Text variant="small" tone="muted" style={{ textAlign: "center", maxWidth: 320 }}>
          {description}
        </Text>
      )}
      {action}
    </View>
  )
}

export interface SkeletonLinesProps {
  lines?: number
  style?: ViewStyle
}

/** Lignes de squelette — largeurs dégressives, comme sur le web. */
export function SkeletonLines({ lines = 3, style }: SkeletonLinesProps) {
  const theme = useTheme()
  const widths = ["40%", "75%", "60%", "68%", "52%"] as const

  return (
    <View style={[{ gap: theme.spacing[2] + 2 }, style]}>
      {Array.from({ length: lines }, (_, i) => (
        <View
          key={i}
          style={{
            height: 14,
            borderRadius: 999,
            backgroundColor: theme.colors.surfaceSunk,
            width: widths[i % widths.length],
          }}
        />
      ))}
    </View>
  )
}
