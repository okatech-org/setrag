import { View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export type TagTone =
  | "accent"
  | "second"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "strong"

export interface TagProps extends ViewProps {
  label: string
  tone?: TagTone
}

/**
 * Pastille de statut — pill, libellé 12/600.
 * Le libellé porte toujours l'information : la teinte ne fait que la renforcer.
 */
export function Tag({ label, tone = "neutral", style, ...props }: TagProps) {
  const theme = useTheme()

  const palette: Record<TagTone, { bg: string; fg: string; border?: string }> = {
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accentInk },
    second: { bg: theme.colors.secondSoft, fg: theme.colors.secondInk },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successInk },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningInk },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerInk },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.infoInk },
    neutral: {
      bg: theme.colors.surfaceSunk,
      fg: theme.colors.inkMuted,
      border: theme.colors.line,
    },
    strong: { bg: theme.colors.ink, fg: theme.colors.inkInverse },
  }

  const t = palette[tone]

  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor: t.bg,
          borderRadius: theme.radius.pill,
          borderWidth: t.border ? 1 : 0,
          borderColor: t.border,
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
        },
        style,
      ]}
      {...props}
    >
      <Text
        style={{
          fontFamily: theme.typography.h4.fontFamily,
          fontSize: 12,
          lineHeight: 12,
          color: t.fg,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
