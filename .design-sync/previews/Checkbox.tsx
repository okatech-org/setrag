import { Checkbox } from "@workspace/ui"

export const Etats = () => (
  <div style={{ display: "grid", gap: 4 }}>
    <Checkbox label="Direct uniquement" defaultChecked />
    <Checkbox label="Avec bagage volumineux" />
    <Checkbox label="Voiture calme" disabled />
  </div>
)
