import { Badge } from "@workspace/ui"

export const Variantes = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    <Badge>Confirmée</Badge>
    <Badge variant="secondary">Brouillon</Badge>
    <Badge variant="outline">Guichet</Badge>
    <Badge variant="success">Payée</Badge>
    <Badge variant="warning">En attente</Badge>
    <Badge variant="destructive">Annulée</Badge>
    <Badge variant="info">Remboursée</Badge>
  </div>
)
