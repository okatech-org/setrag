import { Avatar } from "@workspace/ui"

export const Tailles = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Avatar name="Camille Roux" size="sm" />
    <Avatar name="Camille Roux" />
    <Avatar name="Camille Roux" size="lg" />
  </div>
)

export const Initiales = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Avatar name="Camille Roux" />
    <Avatar name="Jean-Baptiste Ondo" />
    <Avatar name="Ada" />
  </div>
)
