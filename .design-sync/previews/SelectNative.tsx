import { Field, SelectNative } from "@workspace/ui"

export const Classe = () => (
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
