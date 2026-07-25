import { Switch } from "@workspace/ui"

export const Etats = () => (
  <div style={{ display: "grid", gap: 4 }}>
    <Switch label="Alertes retard" defaultChecked />
    <Switch label="Lettre d'information" />
    <Switch label="Notifications SMS" disabled />
  </div>
)
