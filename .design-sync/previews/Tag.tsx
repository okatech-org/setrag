import { Tag } from "@workspace/ui"

export const Statuts = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    <Tag tone="accent">Éco</Tag>
    <Tag tone="second">Dernières places</Tag>
    <Tag tone="success">À l&apos;heure</Tag>
    <Tag tone="warning">+12 min</Tag>
    <Tag tone="danger">Supprimé</Tag>
    <Tag tone="info">Travaux</Tag>
    <Tag tone="neutral">1 correspondance</Tag>
    <Tag tone="strong">Choix du moment</Tag>
  </div>
)

export const Filtres = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    <Tag tone="filterOn" onRemove={() => {}}>Direct uniquement</Tag>
    <Tag tone="filterOff">Avec bagage</Tag>
    <Tag tone="filterOff">Voiture calme</Tag>
  </div>
)
