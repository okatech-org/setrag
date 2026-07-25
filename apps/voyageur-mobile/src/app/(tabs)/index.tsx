import { View } from "react-native"

import {
  Button,
  Card,
  InlineMessage,
  Screen,
  Text,
  useTheme,
} from "@workspace/mobile-ui/components"
import { TripResultCard } from "@workspace/mobile-ui/voyage"

/* Horodatages d'exemple, en attendant le branchement sur `trips:search`. */
const DEPART = Date.UTC(2026, 7, 7, 6, 42)
const ARRIVEE = Date.UTC(2026, 7, 7, 20, 38)

export default function RechercheScreen() {
  const theme = useTheme()

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing[1] }}>
        <Text variant="monoLabel" tone="accent">
          SETRAG · TRANSGABONAIS
        </Text>
        <Text variant="h1">Où allez-vous ?</Text>
      </View>

      <Card elevated>
        <Text variant="h4">Owendo → Franceville</Text>
        <Text variant="small" tone="muted">
          Ligne principale · 648 km · environ 14 h de trajet
        </Text>
        <Button title="Rechercher une desserte" size="lg" block />
      </Card>

      <InlineMessage
        tone="warning"
        title="Circulation perturbée entre Booué et Lopé"
        description="Jusqu'à 40 min de retard cet après-midi. Vos billets restent valables sur le train suivant, sans échange."
      />

      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="h4">Prochains départs</Text>
        <TripResultCard
          departureAt={DEPART}
          arrivalAt={ARRIVEE}
          durationMinutes={836}
          originLabel="Owendo"
          destinationLabel="Franceville"
          priceXaf={18000}
          tags={[
            { label: "À l'heure", tone: "success" },
            { label: "Dernières places", tone: "second" },
          ]}
          onPress={() => {}}
        />
      </View>
    </Screen>
  )
}
