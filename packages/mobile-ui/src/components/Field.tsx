import { useState } from "react"
import {
  type StyleProp,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

/**
 * Champs de saisie — hauteur 52, rayon 12, anneau de focus rendu par une
 * bordure épaissie (React Native n'a pas de `box-shadow` fiable sur Android).
 * L'erreur porte toujours un libellé écrit : jamais la couleur seule.
 */

export interface FieldProps extends ViewProps {
  label: string
  hint?: string
  error?: string
  disabled?: boolean
}

export function Field({
  label,
  hint,
  error,
  disabled,
  style,
  children,
  ...props
}: FieldProps) {
  const theme = useTheme()

  return (
    <View style={[{ gap: theme.spacing[1] + 2 }, style]} {...props}>
      <Text
        variant="caption"
        style={{
          fontSize: 13,
          color: error
            ? theme.colors.dangerInk
            : disabled
              ? theme.colors.inkMuted
              : theme.colors.ink,
        }}
      >
        {label}
      </Text>

      {children}

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export interface InputProps extends TextInputProps {
  invalid?: boolean
  style?: StyleProp<TextStyle>
}

export function Input({ invalid, editable = true, style, ...props }: InputProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)

  return (
    <TextInput
      editable={editable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={theme.colors.inkMuted}
      accessibilityState={{ disabled: !editable }}
      style={[
        {
          height: theme.controlHeight.field,
          paddingHorizontal: theme.spacing[4],
          borderRadius: theme.radius.md,
          borderWidth: invalid || focused ? 1.5 : 1,
          borderColor: invalid
            ? theme.colors.danger
            : focused
              ? theme.colors.accent
              : theme.colors.lineStrong,
          backgroundColor: invalid
            ? theme.colors.dangerSoft
            : editable
              ? theme.colors.surface
              : theme.colors.surfaceSunk,
          color: editable ? theme.colors.ink : theme.colors.inkMuted,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: 16,
        },
        style,
      ]}
      {...props}
    />
  )
}

/** Zone de texte — même gabarit, hauteur libre. */
export function Textarea({ rows = 3, style, ...props }: InputProps & { rows?: number }) {
  const theme = useTheme()

  return (
    <Input
      multiline
      textAlignVertical="top"
      style={[
        {
          height: undefined,
          minHeight: 24 * rows + theme.spacing[5],
          paddingVertical: theme.spacing[3],
        },
        style,
      ]}
      {...props}
    />
  )
}
