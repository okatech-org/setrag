import { View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export type BadgeVariant =
  | "default" | "secondary" | "outline"
  | "success" | "warning" | "destructive" | "info"

export interface BadgeProps extends ViewProps {
  label: string
  variant?: BadgeVariant
}

/** Pastille compacte — rayon md, 12/500. Le libellé porte l'information. */
export function Badge({ label, variant = "default", style, ...props }: BadgeProps) {
  const theme = useTheme()

  const tone: Record<BadgeVariant, { bg: string; fg: string; border?: string }> = {
    default: { bg: theme.colors.accent, fg: theme.colors.inkInverse },
    secondary: { bg: theme.colors.surfaceSunk, fg: theme.colors.inkMuted },
    outline: { bg: "transparent", fg: theme.colors.ink, border: theme.colors.lineStrong },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successInk },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningInk },
    destructive: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerInk },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.infoInk },
  }
  const t = tone[variant]

  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor: t.bg,
          borderRadius: theme.radius.md,
          borderWidth: t.border ? 1 : 0,
          borderColor: t.border,
          paddingHorizontal: theme.spacing[2],
          paddingVertical: 3,
        },
        style,
      ]}
      {...props}
    >
      <Text style={{ fontFamily: theme.typography.caption.fontFamily, fontSize: 12, lineHeight: 16, color: t.fg }}>
        {label}
      </Text>
    </View>
  )
}
