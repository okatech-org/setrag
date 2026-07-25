import { Pressable, View, type ViewStyle } from "react-native"

import { useTheme } from "../useTheme"
import { Text } from "../Text"
import { Button } from "../Button"
import { SegmentedControl } from "../SegmentedControl"

export type TripKind = "aller_retour" | "aller_simple" | "multi_etapes"

const TRIP_KINDS = [
  { value: "aller_retour", label: "Aller-retour" },
  { value: "aller_simple", label: "Aller simple" },
  { value: "multi_etapes", label: "Multi-étapes" },
]

/* Au niveau module : un composant créé pendant le rendu est recréé à chaque
   passe et remonte sa sous-arborescence — ici, la perte du focus au moindre
   changement de filtre. */
function Slot({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress?: () => void
}) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.85 : 1 })}
    >
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View
        style={{
          height: theme.controlHeight.field,
          justifyContent: "center",
          paddingHorizontal: theme.spacing[4],
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.lineStrong,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="body" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  )
}

export interface TripSearchBarProps {
  kind?: TripKind
  onKindChange?: (kind: TripKind) => void
  originLabel?: string
  destinationLabel?: string
  datesLabel?: string
  passengersLabel?: string
  onPressOrigin?: () => void
  onPressDestination?: () => void
  onPressDates?: () => void
  onPressPassengers?: () => void
  onSwap?: () => void
  onSubmit?: () => void
  submitting?: boolean
  style?: ViewStyle
}

/**
 * Barre de recherche voyage — empilée sur mobile, là où le web tient sur une
 * ligne. Chaque champ ouvre son propre sélecteur : le composant n'affiche que
 * la valeur retenue.
 */
export function TripSearchBar({
  kind = "aller_retour",
  onKindChange,
  originLabel = "—",
  destinationLabel = "—",
  datesLabel = "—",
  passengersLabel = "—",
  onPressOrigin,
  onPressDestination,
  onPressDates,
  onPressPassengers,
  onSwap,
  onSubmit,
  submitting = false,
  style,
}: TripSearchBarProps) {
  const theme = useTheme()

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
        theme.shadows.md,
        style,
      ]}
    >
      <SegmentedControl
        label="Type de trajet"
        value={kind}
        onValueChange={(v) => onKindChange?.(v as TripKind)}
        options={TRIP_KINDS}
      />

      <Slot label="Départ" value={originLabel} onPress={onPressOrigin} />

      {onSwap && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inverser le départ et l'arrivée"
          onPress={onSwap}
          style={{
            alignSelf: "flex-end",
            width: 40,
            height: 40,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="body" tone="muted">
            ⇅
          </Text>
        </Pressable>
      )}

      <Slot label="Arrivée" value={destinationLabel} onPress={onPressDestination} />
      <Slot label="Dates" value={datesLabel} onPress={onPressDates} />
      <Slot label="Voyageurs" value={passengersLabel} onPress={onPressPassengers} />

      <Button
        title="Rechercher"
        size="lg"
        block
        onPress={onSubmit}
        loading={submitting}
        loadingLabel="Recherche…"
      />
    </View>
  )
}
