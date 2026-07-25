import { View, type ViewStyle } from "react-native"

import { formatTime, spellTime } from "@workspace/shared/utils/format"

import { useTheme } from "../useTheme"
import { Text } from "../Text"

export type TicketState =
  | "valide"
  | "utilise"
  | "echange"
  | "rembourse"
  | "hors_ligne"

const STATE_LABELS: Record<TicketState, string> = {
  valide: "Valide",
  utilise: "Utilisé",
  echange: "Échangé",
  rembourse: "Remboursé",
  hors_ligne: "Hors ligne",
}

export interface TicketProps {
  legLabel: string
  routeLabel: string
  departureAt: number
  arrivalAt: number
  departurePlace?: string
  arrivalPlace?: string
  seatLabel?: string
  seatNote?: string
  passengerLabel: string
  reference: string
  conditionsNote?: string
  state?: TicketState
  /** QR code fourni par l'app (react-native-qrcode-svg). */
  qrCode?: React.ReactNode
  style?: ViewStyle
}

/**
 * Billet — fond encre, chiffres en mono, séparation avant le QR code.
 * Pensé pour être lu debout, en gare, à contre-jour.
 */
export function Ticket({
  legLabel,
  routeLabel,
  departureAt,
  arrivalAt,
  departurePlace,
  arrivalPlace,
  seatLabel,
  seatNote,
  passengerLabel,
  reference,
  conditionsNote,
  state = "valide",
  qrCode,
  style,
}: TicketProps) {
  const theme = useTheme()

  const stateTone: Record<TicketState, string> = {
    valide: theme.colors.success,
    utilise: theme.colors.lineStrong,
    echange: theme.colors.info,
    rembourse: theme.colors.second,
    hors_ligne: theme.colors.warning,
  }

  return (
    <View
      accessibilityLabel={`Billet ${routeLabel}, ${STATE_LABELS[state]}, départ à ${spellTime(departureAt)}, dossier ${reference}`}
      style={[
        {
          backgroundColor: theme.colors.ink,
          borderRadius: theme.radius.lg,
          padding: theme.spacing[6],
          gap: theme.spacing[6],
        },
        theme.shadows.lg,
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: theme.spacing[4],
        }}
      >
        <View style={{ gap: 4, flex: 1 }}>
          <Text variant="monoLabel" style={{ color: theme.colors.accent }}>
            {legLabel}
          </Text>
          <Text variant="h3" tone="inverse">
            {routeLabel}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: stateTone[state],
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing[3],
            paddingVertical: theme.spacing[2],
          }}
        >
          <Text
            style={{
              fontFamily: theme.typography.h4.fontFamily,
              fontSize: 12,
              lineHeight: 12,
              color: theme.colors.ink,
            }}
          >
            {STATE_LABELS[state]}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: theme.spacing[5] }}>
        <Fact label="Départ" value={formatTime(departureAt)} note={departurePlace} />
        <Fact label="Arrivée" value={formatTime(arrivalAt)} note={arrivalPlace} />
        {seatLabel && <Fact label="Voiture / place" value={seatLabel} note={seatNote} />}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[5],
          borderTopWidth: 1,
          borderTopColor: theme.colors.inkMuted,
          borderStyle: "dashed",
          paddingTop: theme.spacing[6],
        }}
      >
        {qrCode && (
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {qrCode}
          </View>
        )}
        <View style={{ gap: 6, flex: 1 }}>
          <Text variant="caption" style={{ color: theme.colors.inkMuted }}>
            {passengerLabel}
          </Text>
          <Text variant="mono" tone="inverse">
            DOSSIER · {reference}
          </Text>
          {conditionsNote && (
            <Text variant="caption" style={{ color: theme.colors.inkMuted }}>
              {conditionsNote}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}

function Fact({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  const theme = useTheme()

  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text
        variant="caption"
        style={{ fontSize: 11, lineHeight: 11, color: theme.colors.inkMuted }}
      >
        {label}
      </Text>
      <Text variant="timeSm" tone="inverse">
        {value}
      </Text>
      {note && (
        <Text
          variant="caption"
          style={{ fontSize: 12, lineHeight: 16, color: theme.colors.inkMuted }}
        >
          {note}
        </Text>
      )}
    </View>
  )
}

export { STATE_LABELS as TICKET_STATE_LABELS }
