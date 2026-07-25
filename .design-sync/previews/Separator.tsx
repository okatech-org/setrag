import { Separator } from "@workspace/ui"

export const Horizontal = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
    <span className="text-small text-ink-muted">Aller · 07:42 → 21:38</span>
    <Separator />
    <span className="text-small text-ink-muted">Retour · 18:12 → 08:07</span>
  </div>
)
