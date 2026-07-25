import { Button } from "@workspace/ui"

export const Variantes = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button size="lg">Rechercher</Button>
    <Button size="lg" variant="secondary">Modifier</Button>
    <Button size="lg" variant="ghost">Voir le détail</Button>
    <Button size="lg" variant="danger">Annuler le billet</Button>
  </div>
)

export const Tailles = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button size="sm">sm — 36</Button>
    <Button size="md">md — 44</Button>
    <Button size="lg">lg — 52</Button>
  </div>
)

export const Etats = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button>Par défaut</Button>
    <Button disabled>Désactivé</Button>
    <Button loading loadingLabel="Recherche…">Rechercher</Button>
  </div>
)

export const Bloc = () => (
  <div style={{ maxWidth: 420 }}>
    <Button size="lg" block>Payer 166 000 F</Button>
  </div>
)
