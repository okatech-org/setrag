import { View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export type MessageTone = "info" | "success" | "warning" | "danger"

export interface InlineMessageProps extends ViewProps {
  title: string
  description?: string
  tone?: MessageTone
}

/**
 * Message en ligne — fond teinté, filet de 3 px à gauche.
 * Ton concret : on dit l'effet sur le voyage, pas le vocabulaire d'exploitation.
 */
export function InlineMessage({
  title,
  description,
  tone = "info",
  style,
  ...props
}: InlineMessageProps) {
  const theme = useTheme()

  const palette: Record<MessageTone, { bg: string; bar: string; fg: string }> = {
    info: {
      bg: theme.colors.infoSoft,
      bar: theme.colors.info,
      fg: theme.colors.infoInk,
    },
    success: {
      bg: theme.colors.successSoft,
      bar: theme.colors.success,
      fg: theme.colors.successInk,
    },
    warning: {
      bg: theme.colors.warningSoft,
      bar: theme.colors.warning,
      fg: theme.colors.warningInk,
    },
    danger: {
      bg: theme.colors.dangerSoft,
      bar: theme.colors.danger,
      fg: theme.colors.dangerInk,
    },
  }

  const t = palette[tone]

  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          backgroundColor: t.bg,
          borderLeftWidth: 3,
          borderLeftColor: t.bar,
          borderRadius: theme.radius.md,
          padding: theme.spacing[4],
          gap: theme.spacing[1],
        },
        style,
      ]}
      {...props}
    >
      <Text
        style={{
          fontFamily: theme.typography.h4.fontFamily,
          fontSize: 15,
          lineHeight: 21,
          color: t.fg,
        }}
      >
        {title}
      </Text>
      {description && (
        <Text variant="small" style={{ color: t.fg }}>
          {description}
        </Text>
      )}
    </View>
  )
}
