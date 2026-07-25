import { Button, EmptyState } from "@workspace/ui"

export const AucunTrain = () => (
  <div style={{ maxWidth: 520 }}>
    <EmptyState
      title="Aucun train sur ce créneau"
      description="Essayez le jour suivant, ou élargissez à toute la journée — il reste des places le matin."
      action={<Button variant="ghost" size="sm">Voir le 8 août</Button>}
    />
  </div>
)

export const AucunBillet = () => (
  <div style={{ maxWidth: 520 }}>
    <EmptyState
      title="Aucun billet pour le moment"
      description="Vos billets électroniques apparaîtront ici après paiement, y compris hors connexion."
    />
  </div>
)
