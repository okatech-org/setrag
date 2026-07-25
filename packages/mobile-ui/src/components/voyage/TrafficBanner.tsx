import { View, type ViewStyle } from "react-native"

import { useTheme } from "../useTheme"
import { Text } from "../Text"

export type TrafficTone = "warning" | "info" | "danger"

export interface TrafficBannerProps {
  title: string
  description: string
  tone?: TrafficTone
  action?: React.ReactNode
  style?: ViewStyle
}

/**
 * Bandeau info trafic. Le ton dit l'effet sur le voyage du client, pas le
 * vocabulaire d'exploitation.
 */
export function TrafficBanner({
  title, description, tone = "warning", action, style,
}: TrafficBannerProps) {
  const theme = useTheme()

  const palette = {
    warning: { bg: theme.colors.warningSoft, dot: theme.colors.warning, fg: theme.colors.warningInk },
    info: { bg: theme.colors.infoSoft, dot: theme.colors.info, fg: theme.colors.infoInk },
    danger: { bg: theme.colors.dangerSoft, dot: theme.colors.danger, fg: theme.colors.dangerInk },
  }[tone]

  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flexDirection: "row",
          gap: theme.spacing[4],
          backgroundColor: palette.bg,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: palette.dot,
          padding: theme.spacing[5],
        },
        style,
      ]}
    >
      <View
        style={{
          width: 8, height: 8, borderRadius: 999,
          backgroundColor: palette.dot, marginTop: 7,
        }}
      />
      <View style={{ flex: 1, gap: theme.spacing[1] + 2 }}>
        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontSize: 16, lineHeight: 21, color: palette.fg }}>
          {title}
        </Text>
        <Text variant="small" style={{ color: palette.fg }}>
          {description}
        </Text>
        {action}
      </View>
    </View>
  )
}
