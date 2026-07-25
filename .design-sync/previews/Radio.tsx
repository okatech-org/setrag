import { Radio, RadioGroup } from "@workspace/ui"

/* Radio se compose toujours dans son RadioGroup : hors contexte il ne rend pas. */
export const DansSonGroupe = () => (
  <RadioGroup defaultValue="economique">
    <Radio value="economique" label="Économique" />
    <Radio value="confort" label="Confort" />
    <Radio value="vip" label="VIP" />
  </RadioGroup>
)
