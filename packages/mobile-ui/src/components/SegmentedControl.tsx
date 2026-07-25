import { Pressable, View, type ViewStyle } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value?: string
  onValueChange?: (value: string) => void
  label: string
  style?: ViewStyle
}

/**
 * Choix exclusif en pastilles. L'option retenue prend le fond encre : c'est le
 * seul contraste qui tienne à côté des pastilles de statut, déjà teintées.
 */
export function SegmentedControl({
  options, value, onValueChange, label, style,
}: SegmentedControlProps) {
  const theme = useTheme()

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] + 2 }, style]}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onValueChange?.(option.value)}
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: active ? 8 : 7,
              borderWidth: active ? 0 : 1,
              borderColor: theme.colors.lineStrong,
              backgroundColor: active ? theme.colors.ink : "transparent",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: active
                  ? theme.typography.h4.fontFamily
                  : theme.typography.caption.fontFamily,
                fontSize: 12,
                lineHeight: 12,
                color: active ? theme.colors.inkInverse : theme.colors.inkMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
