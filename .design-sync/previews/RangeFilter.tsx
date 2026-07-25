import { RangeFilter } from "@workspace/ui"

export const PrixMax = () => (
  <div style={{ maxWidth: 260 }}>
    <RangeFilter
      defaultValue={[40500]}
      min={18000}
      max={54000}
      step={1500}
      valueLabel="jusqu'à 40 500 FCFA"
    />
  </div>
)
