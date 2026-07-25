import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native"

import { typography } from "../tokens"
import { useTheme } from "./useTheme"

export type TextVariant = keyof typeof typography

export type TextTone =
  | "default"
  | "muted"
  | "faint"
  | "inverse"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"

export interface TextProps extends RNTextProps {
  variant?: TextVariant
  tone?: TextTone
}

export function Text({
  variant = "body",
  tone = "default",
  style,
  ...props
}: TextProps) {
  const theme = useTheme()

  const color: Record<TextTone, string> = {
    default: theme.colors.ink,
    muted: theme.colors.inkMuted,
    faint: theme.colors.inkFaint,
    inverse: theme.colors.inkInverse,
    accent: theme.colors.accentInk,
    success: theme.colors.successInk,
    warning: theme.colors.warningInk,
    danger: theme.colors.dangerInk,
    info: theme.colors.infoInk,
  }

  return (
    <RNText
      style={[typography[variant] as TextStyle, { color: color[tone] }, style]}
      {...props}
    />
  )
}
