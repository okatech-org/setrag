import { Pressable, View, type ViewStyle } from "react-native"

import {
  formatDuration,
  formatTime,
  formatXaf,
  spellTime,
} from "@workspace/shared/utils/format"

import { useTheme } from "../useTheme"
import { Text } from "../Text"
import { Tag, type TagTone } from "../Tag"

export type TripCardState = "default" | "selected" | "cancelled"

export interface TripResultCardProps {
  departureAt: number
  arrivalAt: number
  durationMinutes: number
  originLabel: string
  destinationLabel: string
  connectionLabel?: string
  priceXaf?: number
  priceNote?: string
  tags?: Array<{ label: string; tone?: TagTone }>
  state?: TripCardState
  cancelledNotice?: string
  selectionNote?: string
  onPress?: () => void
  style?: ViewStyle
}

/**
 * Carte de résultat trajet — l'heure d'abord (mono 25), le prix ensuite,
 * le reste en gris. Les heures sont annoncées en clair aux lecteurs d'écran.
 */
export function TripResultCard({
  departureAt,
  arrivalAt,
  durationMinutes,
  originLabel,
  destinationLabel,
  connectionLabel = "Direct",
  priceXaf,
  priceNote = "Classe économique · par personne",
  tags = [],
  state = "default",
  cancelledNotice,
  selectionNote,
  onPress,
  style,
}: TripResultCardProps) {
  const theme = useTheme()
  const selected = state === "selected"
  const cancelled = state === "cancelled"
  const direct = connectionLabel.toLowerCase().startsWith("direct")

  const label = cancelled
    ? `Desserte supprimée au départ de ${spellTime(departureAt)}`
    : `Départ à ${spellTime(departureAt)}, arrivée à ${spellTime(arrivalAt)}, ${formatDuration(durationMinutes)}, ${connectionLabel}${
        priceXaf !== undefined ? `, ${formatXaf(priceXaf)}` : ""
      }`

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          backgroundColor: selected
            ? theme.colors.accentSoft
            : theme.colors.surface,
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? theme.colors.accent : theme.colors.line,
          borderRadius: 16,
          padding: theme.spacing[5],
          gap: theme.spacing[3],
          opacity: cancelled ? 0.7 : pressed ? 0.95 : 1,
        },
        style,
      ]}
    >
      {cancelled ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[4] }}>
            <Text
              variant="time"
              tone="muted"
              style={{ textDecorationLine: "line-through" }}
            >
              {formatTime(departureAt)}
            </Text>
            <Tag label="Train supprimé" tone="danger" />
          </View>
          {cancelledNotice && (
            <Text variant="small" tone="muted">
              {cancelledNotice}
            </Text>
          )}
        </>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.spacing[3],
            }}
          >
            <Text variant="time" accessibilityElementsHidden>
              {formatTime(departureAt)}
            </Text>

            <View style={{ flex: 1, gap: 4, alignItems: "center" }}>
              <Text
                variant="mono"
                style={{
                  fontSize: 11,
                  lineHeight: 11,
                  color: selected ? theme.colors.accentInk : theme.colors.inkFaint,
                }}
              >
                {formatDuration(durationMinutes)}
              </Text>
              <View
                style={{
                  height: 2,
                  alignSelf: "stretch",
                  backgroundColor: selected ? theme.colors.accentLine : theme.colors.line,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    [direct ? "right" : "left"]: direct ? -1 : "50%",
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: direct
                      ? theme.colors.accent
                      : theme.colors.lineStrong,
                  }}
                />
              </View>
              <Text
                variant="caption"
                style={{
                  fontSize: 11,
                  lineHeight: 11,
                  color: selected ? theme.colors.accentInk : theme.colors.inkFaint,
                }}
              >
                {connectionLabel}
              </Text>
            </View>

            <Text variant="time" accessibilityElementsHidden>
              {formatTime(arrivalAt)}
            </Text>
          </View>

          <Text variant="caption" tone={selected ? "accent" : "muted"} style={{ fontSize: 13 }}>
            {selected && selectionNote
              ? selectionNote
              : `${originLabel} → ${destinationLabel}`}
          </Text>

          {tags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
              {tags.map((tag) => (
                <Tag key={tag.label} label={tag.label} tone={tag.tone ?? "neutral"} />
              ))}
            </View>
          )}
        </>
      )}

      {priceXaf !== undefined && !cancelled && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: selected ? theme.colors.accentLine : theme.colors.line,
            paddingTop: theme.spacing[3],
            gap: theme.spacing[3],
          }}
        >
          <Text variant="caption" tone={selected ? "accent" : "faint"}>
            {selected ? "✓ Dans votre panier" : priceNote}
          </Text>
          <Text variant="h3">{formatXaf(priceXaf)}</Text>
        </View>
      )}
    </Pressable>
  )
}
