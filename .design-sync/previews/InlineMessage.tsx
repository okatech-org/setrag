import { InlineMessage } from "@workspace/ui"

export const Tons = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
    <InlineMessage tone="info" title="Travaux prévus">
      — ligne modifiée les week-ends d&apos;août.
    </InlineMessage>
    <InlineMessage tone="success" title="Paiement accepté">
      — vos billets sont dans l&apos;application.
    </InlineMessage>
    <InlineMessage tone="warning" title="Retard annoncé">
      — votre train partira 12 min plus tard. Votre place est conservée.
    </InlineMessage>
    <InlineMessage tone="danger" title="Train supprimé">
      — on vous propose deux solutions.
    </InlineMessage>
  </div>
)
