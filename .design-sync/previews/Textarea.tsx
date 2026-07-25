import { Field, Textarea } from "@workspace/ui"

export const Simple = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Un mot pour l'assistance">
      <Textarea placeholder="Décrivez votre situation" rows={4} />
    </Field>
  </div>
)
