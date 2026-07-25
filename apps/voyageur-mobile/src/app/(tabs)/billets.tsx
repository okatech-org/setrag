import { Card, Screen, Text } from "@workspace/mobile-ui/components"
import { Ticket } from "@workspace/mobile-ui/voyage"

const DEPART = Date.UTC(2026, 7, 7, 6, 42)
const ARRIVEE = Date.UTC(2026, 7, 7, 20, 38)

export default function BilletsScreen() {
  /* Exemple statique — à remplacer par la query `tickets:listMine`. */
  const hasTickets = true

  return (
    <Screen scroll>
      <Text variant="h1">Mes billets</Text>

      {hasTickets ? (
        <Ticket
          legLabel="Aller · vendredi 7 août"
          routeLabel="Owendo → Franceville"
          departureAt={DEPART}
          arrivalAt={ARRIVEE}
          departurePlace="Gare d'Owendo · Hall 1"
          arrivalPlace="Gare de Franceville"
          seatLabel="12 · 44"
          seatNote="Fenêtre, sens marche"
          passengerLabel="Camille Roux · Tarif Jeune"
          reference="KX7 24Q"
          conditionsNote="Échangeable jusqu'à 30 min avant le départ"
        />
      ) : (
        <Card>
          <Text variant="h4">Aucun billet pour le moment</Text>
          <Text variant="small" tone="muted">
            Vos billets électroniques et leurs QR codes apparaîtront ici après
            paiement, y compris hors connexion.
          </Text>
        </Card>
      )}
    </Screen>
  )
}
