import { createContext, useContext } from "react"
import { Pressable, View, type ViewStyle } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

/**
 * Contrôles de sélection — case 22 px (rayon 6), radio 22 px, interrupteur
 * 44 × 26. La zone pressable englobe le libellé pour atteindre la cible
 * tactile de 44 px.
 */

interface ChoiceRowProps {
  label: string
  checked?: boolean
  disabled?: boolean
  onPress?: () => void
  role: "checkbox" | "radio" | "switch"
  style?: ViewStyle
  children: React.ReactNode
}

function ChoiceRow({
  label,
  checked,
  disabled,
  onPress,
  role,
  style,
  children,
}: ChoiceRowProps) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: theme.targetMin,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {children}
      <Text variant="body" style={{ fontSize: 15 }} tone={disabled ? "muted" : "default"}>
        {label}
      </Text>
    </Pressable>
  )
}

export interface CheckboxProps {
  label: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  style?: ViewStyle
}

export function Checkbox({
  label,
  checked = false,
  onCheckedChange,
  disabled,
  style,
}: CheckboxProps) {
  const theme = useTheme()

  return (
    <ChoiceRow
      role="checkbox"
      label={label}
      checked={checked}
      disabled={disabled}
      onPress={() => onCheckedChange?.(!checked)}
      style={style}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? theme.colors.accent : theme.colors.lineStrong,
          backgroundColor: checked
            ? theme.colors.accent
            : disabled
              ? theme.colors.surfaceSunk
              : theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && (
          <Text
            style={{
              fontFamily: theme.typography.h4.fontFamily,
              fontSize: 13,
              lineHeight: 13,
              color: theme.colors.inkInverse,
            }}
          >
            ✓
          </Text>
        )}
      </View>
    </ChoiceRow>
  )
}

const RadioContext = createContext<{
  value?: string
  onValueChange?: (v: string) => void
}>({})

export interface RadioGroupProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  style?: ViewStyle
}

export function RadioGroup({
  value,
  onValueChange,
  children,
  style,
}: RadioGroupProps) {
  const theme = useTheme()

  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      <View accessibilityRole="radiogroup" style={[{ gap: theme.spacing[1] }, style]}>
        {children}
      </View>
    </RadioContext.Provider>
  )
}

export interface RadioProps {
  value: string
  label: string
  disabled?: boolean
}

export function Radio({ value, label, disabled }: RadioProps) {
  const theme = useTheme()
  const group = useContext(RadioContext)
  const checked = group.value === value

  return (
    <ChoiceRow
      role="radio"
      label={label}
      checked={checked}
      disabled={disabled}
      onPress={() => group.onValueChange?.(value)}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: checked ? theme.colors.accent : theme.colors.lineStrong,
          backgroundColor: disabled ? theme.colors.surfaceSunk : theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
            }}
          />
        )}
      </View>
    </ChoiceRow>
  )
}

export interface SwitchProps {
  label: string
  value?: boolean
  onValueChange?: (value: boolean) => void
  disabled?: boolean
}

export function Switch({ label, value = false, onValueChange, disabled }: SwitchProps) {
  const theme = useTheme()

  return (
    <ChoiceRow
      role="switch"
      label={label}
      checked={value}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
    >
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          padding: 3,
          backgroundColor: value ? theme.colors.accent : theme.colors.line,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
          }}
        />
      </View>
    </ChoiceRow>
  )
}
