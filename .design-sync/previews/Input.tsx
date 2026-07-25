import { Field, Input } from "@workspace/ui"

export const Simple = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Gare de départ">
      <Input placeholder="Gare, ville ou point d'arrêt" />
    </Field>
  </div>
)

export const Erreur = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Numéro de téléphone" error="Il manque 2 chiffres pour valider le numéro.">
      <Input defaultValue="+241 06 12 34" />
    </Field>
  </div>
)
