import { View, type ViewStyle } from "react-native"

import { useTheme } from "../useTheme"
import { Text } from "../Text"

/**
 * Aperçu d'une carte de wallet (Apple Wallet, Google Wallet).
 *
 * Ne produit pas le pass — celui-ci est signé côté serveur. Restitue son rendu
 * pour montrer au voyageur ce qu'il ajoute. Plafonds repris de la plateforme,
 * à ne pas dépasser sous peine de troncature : 3 champs d'en-tête,
 * 2 principaux, 4 secondaires, 5 auxiliaires.
 */
export interface WalletField {
  label: string
  value: string
  mono?: boolean
}

export interface WalletPassProps {
  logoText?: string
  headerFields?: WalletField[]
  origin: WalletField
  destination: WalletField
  secondaryFields?: WalletField[]
  auxiliaryFields?: WalletField[]
  qrCode?: React.ReactNode
  barcodeAltText?: string
  style?: ViewStyle
}

/* Au niveau module — voir la note dans TripSearchBar. */
function PassField({ f, big, end }: { f: WalletField; big?: boolean; end?: boolean }) {
  const theme = useTheme()

  return (
    <View style={{ gap: 4, alignItems: end ? "flex-end" : "flex-start", minWidth: 0 }}>
      <Text
        style={{
          fontFamily: theme.typography.caption.fontFamily,
          fontSize: 10,
          lineHeight: 12,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: theme.colors.inkInverse,
          opacity: 0.75,
        }}
      >
        {f.label}
      </Text>
      <Text
        style={{
          fontFamily: f.mono
            ? theme.typography.time.fontFamily
            : theme.typography.h4.fontFamily,
          fontSize: big ? 24 : 15,
          lineHeight: big ? 26 : 17,
          color: theme.colors.inkInverse,
        }}
        numberOfLines={1}
      >
        {f.value}
      </Text>
    </View>
  )
}

export function WalletPass({
  logoText = "SETRAG",
  headerFields = [],
  origin,
  destination,
  secondaryFields = [],
  auxiliaryFields = [],
  qrCode,
  barcodeAltText,
  style,
}: WalletPassProps) {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          gap: theme.spacing[5],
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: theme.colors.accent,
          padding: theme.spacing[5],
        },
        theme.shadows.lg,
        style,
      ]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          style={{
            fontFamily: theme.typography.h4.fontFamily,
            fontSize: 13, lineHeight: 13, color: theme.colors.inkInverse,
          }}
        >
          {logoText}
        </Text>
        {headerFields.slice(0, 3).map((f) => (
          <PassField key={f.label} f={f} end />
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing[3] }}>
        <PassField f={origin} big />
        <Text style={{ fontSize: 18, lineHeight: 26, color: theme.colors.inkInverse, opacity: 0.7 }}>→</Text>
        <PassField f={destination} big end />
      </View>

      {secondaryFields.length > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[3] }}>
          {secondaryFields.slice(0, 4).map((f) => <PassField key={f.label} f={f} />)}
        </View>
      )}

      {auxiliaryFields.length > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[3] }}>
          {auxiliaryFields.slice(0, 5).map((f) => <PassField key={f.label} f={f} />)}
        </View>
      )}

      {qrCode && (
        <View
          style={{
            alignItems: "center", gap: theme.spacing[2],
            backgroundColor: theme.colors.surface,
            borderRadius: 10, padding: theme.spacing[3],
          }}
        >
          <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
            {qrCode}
          </View>
          {barcodeAltText && (
            <Text variant="mono" style={{ fontSize: 11, lineHeight: 11, color: theme.colors.ink }}>
              {barcodeAltText}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
