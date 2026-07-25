import { Field, Input, SelectNative, Textarea } from "@workspace/ui"

export const Aide = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Gare de départ" hint="Tapez au moins 2 lettres, on complète le reste.">
      <Input placeholder="Gare, ville ou point d'arrêt" />
    </Field>
  </div>
)

export const Rempli = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Gare d'arrivée">
      <Input defaultValue="Franceville" />
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

export const Desactive = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Carte de réduction" disabled>
      <Input placeholder="Ajoutez d'abord un voyageur" />
    </Field>
  </div>
)

export const Selection = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Classe">
      <SelectNative defaultValue="economique">
        <option value="economique">Économique</option>
        <option value="confort">Confort</option>
        <option value="vip">VIP</option>
      </SelectNative>
    </Field>
  </div>
)

export const Zone = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Un mot pour l'assistance">
      <Textarea placeholder="Décrivez votre situation" rows={3} />
    </Field>
  </div>
)
