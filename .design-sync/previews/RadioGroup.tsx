import { Radio, RadioGroup } from "@workspace/ui"

export const TypeDeTrajet = () => (
  <RadioGroup defaultValue="ar">
    <Radio value="ar" label="Aller-retour" />
    <Radio value="as" label="Aller simple" />
    <Radio value="me" label="Multi-étapes" />
  </RadioGroup>
)
