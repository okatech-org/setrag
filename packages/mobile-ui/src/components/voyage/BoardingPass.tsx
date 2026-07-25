import { View, type ViewStyle } from "react-native"

import { useTheme } from "../useTheme"
import { Text } from "../Text"
import { Button } from "../Button"

export interface BoardingPassProps {
  /** « Départ dans 34 min » — le compte à rebours prime sur l'heure absolue. */
  countdownLabel: string
  routeLabel: string
  coachLabel?: string
  seatLabel?: string
  platformLabel?: string
  reference: string
  qrCode?: React.ReactNode
  onAddToWallet?: () => void
  onExchange?: () => void
  style?: ViewStyle
}

/**
 * Carte d'embarquement — l'écran qu'on ouvre debout sur le quai : compte à
 * rebours, relation, puis les trois nombres qu'on cherche du regard.
 */
export function BoardingPass({
  countdownLabel, routeLabel, coachLabel, seatLabel, platformLabel,
  reference, qrCode, onAddToWallet, onExchange, style,
}: BoardingPassProps) {
  const theme = useTheme()
  const facts = [
    { label: "Voiture", value: coachLabel },
    { label: "Place", value: seatLabel },
    { label: "Quai", value: platformLabel },
  ].filter((f) => f.value)

  return (
    <View
      style={[
        {
          gap: theme.spacing[4],
          borderRadius: 28,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          padding: theme.spacing[4],
        },
        theme.shadows.lg,
        style,
      ]}
    >
      <View style={{ gap: 4 }}>
        <Text variant="monoLabel" tone="accent">{countdownLabel}</Text>
        <Text variant="h3">{routeLabel}</Text>
      </View>

      <View
        style={{
          gap: theme.spacing[4],
          backgroundColor: theme.colors.surfaceSunk,
          borderRadius: 16,
          padding: 18,
        }}
      >
        {facts.length > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {facts.map((f) => (
              <View key={f.label} style={{ gap: 2 }}>
                <Text variant="caption" tone="muted" style={{ fontSize: 11, lineHeight: 11 }}>
                  {f.label}
                </Text>
                <Text variant="timeSm">{f.value}</Text>
              </View>
            ))}
          </View>
        )}

        {qrCode && (
          <View
            style={{
              height: 120, borderRadius: 10, overflow: "hidden",
              backgroundColor: theme.colors.surface,
              alignItems: "center", justifyContent: "center",
            }}
          >
            {qrCode}
          </View>
        )}

        <Text variant="mono" tone="muted" style={{ textAlign: "center", fontSize: 13 }}>
          {reference}
        </Text>
      </View>

      {(onAddToWallet || onExchange) && (
        <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
          {onAddToWallet && (
            <Button title="Ajouter au wallet" onPress={onAddToWallet} style={{ flex: 1 }} />
          )}
          {onExchange && (
            <Button title="Échanger" variant="secondary" onPress={onExchange} style={{ flex: 1 }} />
          )}
        </View>
      )}
    </View>
  )
}
