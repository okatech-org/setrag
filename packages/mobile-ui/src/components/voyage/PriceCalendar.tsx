import { Pressable, View, type ViewStyle } from "react-native"

import { useTheme } from "../useTheme"
import { Text } from "../Text"

export interface PriceCalendarDay {
  day: number
  /** Prix le plus bas du jour, en XAF. `null` = aucune desserte. */
  priceXaf: number | null
  value: string
}

export interface PriceCalendarProps {
  monthLabel: string
  days: PriceCalendarDay[]
  selected?: string
  onSelect?: (value: string) => void
  style?: ViewStyle
}

/**
 * Calendrier des prix. Les montants sont affichés sans code devise — porté une
 * seule fois par la légende : dans un septième de largeur, « 18 000 FCFA »
 * déborde.
 */
export function PriceCalendar({
  monthLabel, days, selected, onSelect, style,
}: PriceCalendarProps) {
  const theme = useTheme()
  const prices = days.map((d) => d.priceXaf).filter((p): p is number => p !== null)
  const best = prices.length ? Math.min(...prices) : null
  const compact = (n: number) => new Intl.NumberFormat("fr-GA", { maximumFractionDigits: 0 }).format(n)

  return (
    <View
      style={[
        {
          gap: theme.spacing[4],
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          padding: theme.spacing[5],
        },
        style,
      ]}
    >
      <Text variant="h4" style={{ fontSize: 16 }}>{monthLabel}</Text>

      <View style={{ flexDirection: "row", gap: 6 }}>
        {days.map((day) => {
          const unavailable = day.priceXaf === null
          const isSelected = day.value === selected
          const isBest = !unavailable && best !== null && day.priceXaf === best

          return (
            <Pressable
              key={day.value}
              disabled={unavailable || !onSelect}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: unavailable }}
              onPress={() => onSelect?.(day.value)}
              style={{
                flex: 1, minWidth: 0, alignItems: "center", gap: 3,
                borderRadius: theme.radius.md,
                paddingVertical: 10, paddingHorizontal: 2,
                borderWidth: isSelected || isBest || unavailable ? 0 : 1,
                borderColor: theme.colors.line,
                backgroundColor: isSelected
                  ? theme.colors.ink
                  : unavailable
                    ? theme.colors.surfaceSunk
                    : isBest
                      ? theme.colors.accentSoft
                      : theme.colors.surface,
              }}
            >
              <Text
                variant="mono"
                style={{
                  fontSize: 13, lineHeight: 13,
                  color: isSelected
                    ? theme.colors.inkInverse
                    : unavailable
                      ? theme.colors.inkMuted
                      : theme.colors.ink,
                }}
              >
                {String(day.day).padStart(2, "0")}
              </Text>
              <Text
                variant="mono"
                numberOfLines={1}
                style={{
                  fontSize: 11, lineHeight: 11,
                  color: isSelected
                    ? theme.colors.accentOnInk
                    : unavailable
                      ? theme.colors.inkMuted
                      : isBest
                        ? theme.colors.accentInk
                        : theme.colors.inkMuted,
                }}
              >
                {day.priceXaf === null ? "—" : compact(day.priceXaf)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text variant="caption" tone="muted">Prix en FCFA · meilleur prix en bleu</Text>
    </View>
  )
}
